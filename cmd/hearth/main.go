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

	"github.com/zandoh/hearth/internal/server"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
	"github.com/zandoh/hearth/internal/widgets/calendar"
	"github.com/zandoh/hearth/internal/widgets/chores"
	"github.com/zandoh/hearth/internal/widgets/clock"
	"github.com/zandoh/hearth/internal/widgets/grocery"
	"github.com/zandoh/hearth/internal/widgets/meds"
	"github.com/zandoh/hearth/internal/widgets/weather"
	"github.com/zandoh/hearth/web"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "hearth.db", "path to SQLite database")
	flag.Parse()

	if err := run(*addr, *dbPath); err != nil {
		slog.Error("hearth exited", "err", err)
		os.Exit(1)
	}
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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	reg.StartJobs(ctx)

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
