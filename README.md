# MTG Limited Format Site

A web application for Magic: The Gathering limited format events (Draft & Sealed) with BO3 battle system.

## Features

- Cube management with card import from text/Scryfall
- Draft and Sealed event creation
- AI bot opponents for single-player drafting
- Deck building with visual card piles and CMC sorting
- BO3 battle system with between-games deck modification
- Single elimination tournament with automatic pairing
- Real-time WebSocket updates

## Tech Stack

- **Backend**: Node.js + Express + better-sqlite3
- **Frontend**: Vanilla JavaScript SPA (no build step)
- **Real-time**: WebSocket (ws)
- **Auth**: JWT + bcrypt

## Quick Start

### Local Development

```bash
npm install
npm start
```

Server runs on http://localhost:3001

### Docker Deployment

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The SQLite database and Scryfall card cache are persisted in a Docker volume (`mtg-data`).

## Docker Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `JWT_SECRET` | `mtg-limited-secret-key-dev-2024` | JWT signing secret (change in production!) |

## Project Structure

```
├── server.js          # Express server + game engine
├── launcher.js        # Auto-restart process manager
├── package.json       # Dependencies
├── Dockerfile         # Multi-stage Docker build
├── docker-compose.yml # Container orchestration
├── public/            # Static frontend files
│   ├── index.html     # SPA entry point
│   ├── battle.html    # Battle page
│   ├── css/           # Stylesheets
│   ├── js/            # Client-side JavaScript
│   └── images/        # Token images
└── data/              # Runtime data (gitignored)
    ├── mtg.db         # SQLite database
    └── scryfall-cache.json  # Card oracle cache (~30MB)
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login

### Cubes
- `GET/POST /api/cubes` - List/create cubes
- `PUT/DELETE /api/cubes/:id` - Update/delete cube

### Events
- `GET/POST /api/events` - List/create events
- `POST /api/events/:id/join` - Join event
- `POST /api/events/:id/start` - Start event
- `POST /api/events/:id/auto-pair` - Auto-pair tournament round 1
- `POST /api/events/:id/next-round` - Pair next tournament round

### Battles
- `POST /api/battles` - Create battle
- `POST /api/battles/:id/start` - Start battle
- `POST /api/battles/:id/next-game` - Start next BO3 game (with optional deck update)
- `POST /api/battles/:id/action` - Game action

## License

MIT
