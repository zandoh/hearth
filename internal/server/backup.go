package server

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
)

// handleDownloadBackup streams a fresh snapshot of the database. Taken on
// demand (not the nightly file) so the download is always current.
func (s *Server) handleDownloadBackup(w http.ResponseWriter, r *http.Request) {
	tmp := filepath.Join(os.TempDir(),
		fmt.Sprintf("hearth-download-%d.db", time.Now().UnixNano()))
	if err := s.store.BackupTo(tmp); err != nil {
		httpx.Fail(w, err)
		return
	}
	defer os.Remove(tmp)
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="hearth-%s.db"`, time.Now().Format("2006-01-02")))
	w.Header().Set("Content-Type", "application/vnd.sqlite3")
	http.ServeFile(w, r, tmp)
}
