// Command hearth runs the Hearth home-hub server: API, SSE stream,
// widget jobs, and the embedded web app, all in one binary.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	// Embed the timezone database: container images (distroless/scratch)
	// ship no zoneinfo, and chores/meds/nightly-reload all depend on local
	// time. TZ env still selects the zone.
	_ "time/tzdata"

	"github.com/zandoh/hearth/internal/server"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
	"github.com/zandoh/hearth/internal/widgets/calendar"
	"github.com/zandoh/hearth/internal/widgets/chores"
	"github.com/zandoh/hearth/internal/widgets/clock"
	"github.com/zandoh/hearth/internal/widgets/grocery"
	"github.com/zandoh/hearth/internal/widgets/guestbook"
	"github.com/zandoh/hearth/internal/widgets/mealplan"
	"github.com/zandoh/hearth/internal/widgets/meds"
	"github.com/zandoh/hearth/internal/widgets/weather"
	"github.com/zandoh/hearth/web"
)

func main() {
	// Local secrets convenience; real env vars always win. Must happen
	// before flag parsing side effects read any configuration.
	loadDotEnv(".env")

	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "hearth.db", "path to SQLite database")
	resetGuestPin := flag.Bool("reset-guest-pin", false,
		"clear the guest-mode PIN and exit (admin recovery for a forgotten PIN)")
	flag.Parse()

	if *resetGuestPin {
		if err := doResetGuestPin(*dbPath); err != nil {
			slog.Error("reset guest pin failed", "err", err)
			os.Exit(1)
		}
		slog.Info("guest PIN cleared; any exit attempt on a locked device now unlocks it")
		return
	}

	if err := run(*addr, *dbPath); err != nil {
		slog.Error("hearth exited", "err", err)
		os.Exit(1)
	}
}

// doResetGuestPin is the offline admin path for a forgotten guest PIN: it
// writes straight to the database, so it works whether or not the server
// is running. The running server reads settings per request and needs no
// restart to notice.
func doResetGuestPin(dbPath string) error {
	st, err := store.Open(dbPath)
	if err != nil {
		return err
	}
	defer st.Close()
	return server.ResetGuestPin(st)
}

func run(addr, dbPath string) error {
	st, err := store.Open(dbPath)
	if err != nil {
		return err
	}
	defer st.Close()

	hub := sse.NewHub()

	reg := widget.NewRegistry()
	reg.Register(clock.New(hub))
	reg.Register(calendar.New(st, hub, calendar.Config{
		BaseURL:      os.Getenv("HEARTH_BASE_URL"),
		ClientID:     os.Getenv("HEARTH_GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("HEARTH_GOOGLE_CLIENT_SECRET"),
	}))
	reg.Register(chores.New(st, hub))
	reg.Register(grocery.New(st, hub))
	reg.Register(meds.New(st, hub))
	reg.Register(weather.New(st, hub))
	reg.Register(guestbook.New(st, hub))
	reg.Register(mealplan.New(st, hub))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	reg.StartJobs(ctx)

	// Automatic backups: one snapshot per day into <db dir>/backups, keep
	// the newest 7. Checked hourly so it self-heals regardless of when the
	// server (re)starts.
	go func() {
		tick := time.NewTicker(time.Hour)
		defer tick.Stop()
		for {
			if created, err := st.MaintainBackups(dbPath, time.Now()); err != nil {
				slog.Error("backup failed", "err", err)
			} else if created != "" {
				slog.Info("backup written", "path", created)
			}
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
			}
		}
	}()

	srv := &http.Server{
		Addr:    addr,
		Handler: server.New(st, hub, reg, web.Dist()),
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("hearth listening", "addr", addr, "db", dbPath)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		slog.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return err
		}
		if err := <-errCh; !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}
