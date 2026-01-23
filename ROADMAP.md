# ROADMAP

- [ ] Migrate user manaement to organizations so admin users can add new people to access their stuff
- [ ] Handle no TMDB api key by having a poster placeholder
- [ ] Torrent search added to search page functionality. Specify search you library vs search the index
- [ ] Implement a caching system for torrents. Maybe use index db or a local store (tanstack db?) so we dont hit the TMDB api so much.
  - [ ] Maybe migrate to tanstack query/tanstack db
- [ ] Public website mode
  - [ ] Stream torrents on the client only. TMDB service is still provided (secures our API key), but that's it. Everything else is handled by the client. We shouldnt even use Jackett for this mode.
  - [ ] When a magnet link is added, stream it right away and store th metadata and magnet link on the browser for restreaming if they want to watch it again.
- [ ] Have the download be background jobs instead of main thread processes. Use something light weight like a valkey scheduler
- [ ] Find a way to make scrubbing on MKV/AVI formats work better
- [ ] Pick where you want the movies saved. S3, Google Drive, file server, local drive, etc.
- [ ] Auto updater. Just click a button and it checks for updates and updates the app
- [ ] Subtitles

- [x] Search other torrent aggregators and have an instant "add to library" and "watch now" button
- [x] Search your library
  - [x] Search by title
- [x] Upload tv shows to the library
