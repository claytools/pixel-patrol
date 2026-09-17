# Pixel Patrol

A small, original, old-school browser arcade game inspired by fixed-shooter classics. No external libraries or game assets are required.

## What is already built

- Score begins at **1,000**
- **10 lives**
- Pixel-art enemies in different **colors** and **sizes**
- Starfield on a black background
- Multiple levels that get faster and denser
- Different enemy point values: **100 / 200 / 400**
- Bonus ship worth **1,000**
- Three-character high-score initials
- High scores saved in the current browser with `localStorage`
- Keyboard controls suitable for a Chromebook or desktop browser

## Controls

- **Left / Right Arrow** or **A / D** — move
- **Space** — fire
- **P** — pause
- **R** — restart

## Run locally

The simplest option is to open `index.html` in a browser. A local web server also works:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Put it on GitHub Pages

1. Create a repository and upload these files to the repository root.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then save.
5. GitHub will show the published browser URL after deployment finishes.

> GitHub Pages is not a password-protected private link by default. Treat the URL as public/unlisted unless you configure access control through another hosting setup.

## Easy customization

Most tuning values are near the top of `game.js` or in these functions:

- `resetGame()` — starting score and lives
- `invaderStats()` — enemy sizes and point values
- `spawnWave()` — rows, columns, spacing, and level speed
- `COLORS` — enemy colors
- `drawInvader()` / `drawPlayer()` — pixel art

The title/logo text lives in `index.html` and can be renamed without touching the game code.
