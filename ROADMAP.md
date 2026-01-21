# ROADMAP

- [ ] Find a way to make scrubbing on MKV/AVI formats work better
- [ ] Subtitles
- [ ] Search your library
  - [x] Search by title
  - [ ] Search by year
  - [ ] Search by genre
  - [ ] Search by rating
- [ ] How to handle shows? 
  - [ ] The initial view is just a link to the list of episodes?
  - [ ] The ui should be a context menu thats wide with a scrollable list of the episodes with a play icon to the left of each entry
- [ ] Pick where you want the movies saved. S3, Google Drive, file server, local drive, etc.
- [ ] Search other torrent aggregators and have an instant "add to library" and "watch now" button
- [ ] Auto updater. Just click a button and it checks for updates and updates the app
- [ ] Add an env variable that lets you specify if other are able to sign up for the app, or if that is locked down when one user is in the database
- [ ] Have the download be background jobs instead of main thread processes. Use something light weight like a valkey scheduler
