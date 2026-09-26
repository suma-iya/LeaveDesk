// Package migrations embeds the SQL files so the binary can migrate on startup.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
