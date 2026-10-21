# Go (Baduk) Online - Peer-to-Peer (Japanese Rules)

Play Japanese rules Go (Baduk / Weiqi) online with friends peer-to-peer using WebRTC without any dedicated backend server!

## Features
- **Japanese Rules (Nihon Ki-in)**:
  - 6.5 Komi for White.
  - Basic Ko rule & Suicide move prevention.
  - Capture & prisoner tracking.
  - Dead stone agreement & territory flood-fill scoring upon two consecutive passes.
- **P2P Multiplayer**:
  - Direct peer-to-peer connection via WebRTC (PeerJS).
  - One-click invite link sharing (`?join=<peer-id>`).
  - No database or backend required.
- **Responsive Board**:
  - 19x19, 13x13, and 9x9 board sizes.
  - Realistic wooden canvas styling with star points (hoshi).
  - Real-time ghost stone hover preview.

## Deployment with GitHub Actions
This repository includes a preconfigured GitHub Actions workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) that automatically publishes the site to GitHub Pages on every push to `main`.
