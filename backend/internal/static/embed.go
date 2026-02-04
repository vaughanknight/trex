package static

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:dist
var embeddedFiles embed.FS

// Handler returns an http.Handler that serves the embedded frontend files
func Handler() http.Handler {
	// Strip the "dist" prefix from the embedded filesystem
	fsys, err := fs.Sub(embeddedFiles, "dist")
	if err != nil {
		panic(err)
	}
	return http.FileServer(http.FS(fsys))
}
