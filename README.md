TODO:
- [x] Pretty up the UI
- [ ] Find a way to make scrubbing on MKV/AVI formats work better
- [ ] Subtitles
- [x] Search your library
  - [ ] Search by title
  - [ ] Search by year
  - [ ] Search by genre
  - [ ] Search by rating
- [ ] How to handle shows? 
  - [ ] The initial view is just a link to the list of episodes?
  - [ ] The ui should be a context menu thats wide with a scrollable list of the episodes with a play icon to the left of each entry
- [ ] Pick where you want the movies saved. S3, Google Drive, file server, local drive, etc.
- [ ] Search other torrent aggregators and have an instant "add to library" and "watch now" button
- [x] In the movie view, clicking the image flips to display the metadata descripton, movie length, title, year release, etc. There is a play button in the bottom right corner (not visible when viewing metadata)

# Deployment

You can deploy Plank using the provided `deploy.sh` script. It supports both Docker and Bare Metal deployments.

## Quick Start

1. Make the script executable:
   ```bash
   chmod +x deploy.sh
   ```

2. Run the script:
   ```bash
   ./deploy.sh
   ```

3. Follow the interactive prompts to choose your deployment method and configure the environment.

## Environment Variables

The deployment script will automatically generate a `.env` file for you. You will be prompted for:

- **TMDB_API_KEY**: (Optional) For fetching movie metadata.
- **BETTER_AUTH_SECRET**: (Auto-generated) Secret key for authentication.
- **BETTER_AUTH_URL**: The base URL of your application (default: `http://localhost:3000`).
- **ENABLE_FILE_STORAGE**: Set to `true` to enable local file storage for uploads.

## Manual Deployment

### Docker

```bash
docker compose -f docker/docker-compose.selfhosted.yml up -d --build
```

### Bare Metal

1. Install dependencies: `npm install`
2. Build the app: `npm run build`
3. Run migrations: `npx drizzle-kit migrate`
4. Start the server: `node build`
