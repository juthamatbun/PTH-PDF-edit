# PPDF Content Editing Core

This directory is a clean-room implementation for PPDF.

Goal: edit existing PDF content rather than treating the PDF as a screenshot.

Pipeline:
1. Parse PDF text/content information.
2. Build a stable document model (page → text run/glyph → font/transform/geometry).
3. Record semantic edits: replace, delete, move.
4. Rewrite affected PDF content/resources.
5. Render again for verification before download.

No RevPDF source code, assets, binaries, decompilation, or reverse engineering are used.

## Current milestone
The parser/model/layout boundary is now separated from the UI. The next writer milestone is direct content-stream rewriting with font/resource preservation. Until that writer is complete, the production UI must not claim that an overlay replacement is a true text-object edit.
