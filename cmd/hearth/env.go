package main

import (
	"bufio"
	"log/slog"
	"os"
	"strings"
)

// loadDotEnv reads KEY=VALUE pairs from the given file into the process
// environment. Variables already set in the environment win, so exported
// values and systemd/docker-provided config always override the file.
// Missing file is fine — .env is optional local convenience.
//
// Supported syntax: blank lines, # comments, optional "export " prefix,
// and single- or double-quoted values.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	loaded := 0
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') ||
				(value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		os.Setenv(key, value)
		loaded++
	}
	if loaded > 0 {
		slog.Info("loaded environment from file", "path", path, "vars", loaded)
	}
}
