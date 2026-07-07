# Privacy

Seasonist analyzes your photo entirely on your device, in your browser.

- **No upload.** Your photo is never sent to any server.
- **No photo storage.** Your photo and results are never saved — they live only in memory and vanish when you close or refresh the page. There are no cookies, no analytics, no accounts. To work offline, the app does cache its own files (code, fonts, and the face-detection model) on your device; they contain no personal data, and clearing site data removes them.
- **No training.** Your photo is not used to train any model.
- **A few external loads.** The app fetches its fonts (Google Fonts), the MediaPipe runtime (jsdelivr CDN), and the ~3 MB face-detection model (Google's MediaPipe storage) so analysis can run locally on your device. These requests never contain your image or any personal data, and after the first run they are served from the on-device cache.

Questions: open an issue on this repository.
