package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDotEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	content := `
# comment
HEARTH_TEST_PLAIN=hello
export HEARTH_TEST_EXPORTED=yes
HEARTH_TEST_QUOTED="with spaces"
HEARTH_TEST_SINGLE='single'
HEARTH_TEST_EXISTING=from-file
not-a-pair
=no-key
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HEARTH_TEST_EXISTING", "from-env")
	for _, k := range []string{
		"HEARTH_TEST_PLAIN", "HEARTH_TEST_EXPORTED", "HEARTH_TEST_QUOTED", "HEARTH_TEST_SINGLE",
	} {
		os.Unsetenv(k)
		defer os.Unsetenv(k)
	}

	loadDotEnv(path)

	want := map[string]string{
		"HEARTH_TEST_PLAIN":    "hello",
		"HEARTH_TEST_EXPORTED": "yes",
		"HEARTH_TEST_QUOTED":   "with spaces",
		"HEARTH_TEST_SINGLE":   "single",
		"HEARTH_TEST_EXISTING": "from-env", // real environment wins over the file
	}
	for k, w := range want {
		if got := os.Getenv(k); got != w {
			t.Errorf("%s = %q, want %q", k, got, w)
		}
	}
}

func TestLoadDotEnvMissingFileIsFine(t *testing.T) {
	loadDotEnv(filepath.Join(t.TempDir(), "does-not-exist"))
}
