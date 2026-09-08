# RAF — RetroAchievements Favorite Achievements

<img width="1920" height="1080" alt="raf" src="https://github.com/user-attachments/assets/f0c0b38a-3e76-4128-91f1-d0eb1ae3a385" />

Firefox extension that shows your 3 most favorite achievements: *most fun* 😄, *most challenging* 🤯, *most proud* 🤫.

## Install
1. `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json`
2. Open `https://retroachievements.org/user/<you>`

## Setup
- **API key:** RA → Settings → API Key → paste in `Popup → API Key`. Uses `API_GetAchievementsEarnedBetween` + `API_GetUserProfile`, cached 6h. Without it, falls back to scraping visible games only.
- **Favorites:** On your own profile, `Popup → Pick Favorites` → search → pick up to 3 → Save. Mode `favorites` auto-enables; empty slots fill with hardest. Stored privately `storage.local:raf-fav-<you>`. Shelf renders once, footer picker handles selection (with Cancel).
