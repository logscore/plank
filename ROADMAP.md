# ROADMAP

- [ ] Find a way to make scrubbing on MKV/AVI formats work better
- [ ] Subtitles
- [ ] Search your library
  - [x] Search by title
  - [ ] Search by year
  - [ ] Search by genre
  - [ ] Search by rating
- [x] Upload tv shows to the library
- [ ] Pick where you want the movies saved. S3, Google Drive, file server, local drive, etc.
- [x] Search other torrent aggregators and have an instant "add to library" and "watch now" button
- [ ] Auto updater. Just click a button and it checks for updates and updates the app
- [ ] Add an env variable that lets you specify if other are able to sign up for the app, or if that is locked down when one user is in the database
- [ ] Have the download be background jobs instead of main thread processes. Use something light weight like a valkey scheduler
- [ ] Handle no TMDB api key by having a poster placeholder
- [ ] Maybe i should consolidate the search functionality to for browse and library to just the search page. Have a simple filter button to search browse or library
- [ ] Implement a caching system for torrents. Maybe use index db or redis
