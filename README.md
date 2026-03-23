# 🎬 YouTube Video Downloader (High-Res 4K)

YouTube 영상을 **1080p(1K), 1440p(2K), 2160p(4K)** 고화질로 다운로드할 수 있는 강력한 로컬 도구입니다. 
유튜브의 최신 차단 알고리즘(SABR/403 Forbidden)을 모두 우회하도록 설계되었습니다.

## ✨ 주요 기능
- **고화질 지원**: 1K, 2K, 4K 화질 완벽 지원 (WebM/DASH 결합)
- **차단 우회**: 브라우저 쿠키(Chrome) 연동을 통해 유튜브의 봇 감지 우회
- **백그라운드 서비스**: Mac 로그인 시 자동으로 서버가 실행되는 Always-on 서비스 제공
- **자동 다운로드**: 모든 영상은 Mac의 `Downloads` 폴더로 자동 저장
- **모던 UI**: 다크 모드와 애니메이션이 적용된 프리미엄 디자인

## 🚀 빠른 시작 가이드 (설치 및 실행)

### 1단계: 필수 도구 설치
Mac에 `Homebrew`, `FFmpeg`, `yt-dlp`가 필요합니다. 터미널에서 다음 명령어를 실행하세요:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install ffmpeg yt-dlp node
```

### 2단계: 백그라운드 서비스 활성화
터미널에서 프로젝트 폴더의 `backend`로 이동하여 다음 스크립트를 실행하면 서버가 **항상 백그라운드에서 실행**되도록 설정됩니다:
```bash
cd backend
chmod +x setup_background.sh
./setup_background.sh
```

### 3단계: 사용하기
이제 브라우저에서 아래 주소에 접속하기만 하면 됩니다!
👉 **[http://127.0.0.1:3001](http://127.0.0.1:3001)**

또는 간편하게 배포된 페이지를 사용하셔도 로컬 서버와 연동됩니다:
👉 **[GitHub Pages 배포 주소](https://callmeeddiepark.github.io/youtubedownloader/)**

## 🛡️ 중요: Mac 보안 허용
다운로드를 처음 시작할 때 Mac 보안창이 뜨며 **"yt-dlp이(가) 키체인의 Chrome Safe Storage에 접근하려고 합니다"**라는 메시지가 나오면 반드시 **[항상 허용]**을 눌러주세요. 그래야 사용자의 브라우저 정보를 이용해 유튜브 차단을 우회할 수 있습니다.

## 🛠️ 기술 스택
- **Backend**: Node.js, Express, youtube-dl-exec (yt-dlp)
- **Frontend**: Vanilla JS, HTML5, CSS3 (Glassmorphism Design)
- **Service**: macOS LaunchAgent

## 📝 라이선스
개인 학습 및 사용 목적으로 제작되었습니다.
