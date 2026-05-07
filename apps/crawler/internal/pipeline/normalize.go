package pipeline

import (
	htmltomarkdown "github.com/JohannesKaufmann/html-to-markdown/v2"
)

// HTMLToMarkdown converts a raw HTML page into clean markdown ready for SLM
// consumption. PROJECT.md §2.1: "raw HTML is stripped into clean markdown".
func HTMLToMarkdown(html []byte) (string, error) {
	return htmltomarkdown.ConvertString(string(html))
}
