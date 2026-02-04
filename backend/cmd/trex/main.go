package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/vaughanknight/trex/internal/server"
)

// Version is set via ldflags at build time
var Version = "dev"

func main() {
	fmt.Printf("trex %s\n", Version)

	srv := server.New(Version)

	// Handle graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		fmt.Println("Server starting at http://127.0.0.1:3000")
		if err := http.ListenAndServe("127.0.0.1:3000", srv); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	fmt.Println("\nShutting down...")
}
