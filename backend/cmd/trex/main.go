package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/vaughanknight/trex/internal/config"
	"github.com/vaughanknight/trex/internal/server"
)

// Version is set via ldflags at build time
var Version = "dev"

func main() {
	fmt.Printf("trex %s\n", Version)

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	srv := server.New(Version, cfg)

	// Handle graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		authStatus := ""
		if cfg.AuthEnabled {
			authStatus = " (auth enabled)"
		}
		fmt.Printf("Server starting at http://%s%s\n", cfg.BindAddress, authStatus)
		if err := http.ListenAndServe(cfg.BindAddress, srv); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	fmt.Println("\nShutting down...")
	srv.Shutdown()
}
