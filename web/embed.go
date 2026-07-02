// Package web embeds the built frontend (web/dist) into the server binary.
// Run the frontend build before `go build` to include a real app; without
// it the server still compiles and serves a "not built" notice.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// Dist returns the frontend build rooted at its index.html.
func Dist() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err) // impossible: "dist" is the embedded root
	}
	return sub
}
