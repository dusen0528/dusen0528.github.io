---
title: "인프라 스터디 3주차 Docker Compose로 CI/CD 환경 개선하기"
date: 2026-04-08
category: Infra
summary: "Docker Compose로 프론트엔드, 백엔드, 데이터베이스를 함께 띄우며 서비스 연결 구조를 인프라 관점에서 정리한 글"
tags:
  - Study
  - Docker
  - CI/CD
reading_time: 6 min read
featured: false
---

# 인프라 스터디 3주차 Docker Compose로 CI/CD 환경 개선하기

이번 주에는 Docker와 Docker Compose를 사용해서  
간단한 프론트엔드, 백엔드, 데이터베이스 컨테이너를 함께 띄우는 구성을 살펴보았다.

개인적으로 진행하고 있는 1인 사이드 프로젝트가 있어 이 프로젝트에 적용한 사례를 가지고 왔다.

이런 구성은 단순히 로컬 개발 편의성만을 위한 것이 아니라, CI/CD 환경에서도 동일한 서비스 구성을 재현하고 검증이 편해지기 때문에 초반부터 구성했던 내용들이다.

---

## 이번에 본 Docker Compose 구성

예시 구성은 크게 세 서비스로 나뉜다.

- `postgres`: 데이터 저장을 담당하는 DB 컨테이너
- `backend`: API를 제공하는 백엔드 컨테이너
- `frontend`: 사용자 화면을 제공하는 프론트엔드 컨테이너

민감할 수 있는 값은 그대로 노출하지 않고,  
환경변수 형태를 유지한 예시로 보면 아래와 같다.

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-example}
      POSTGRES_USER: ${POSTGRES_USER:-example}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-***}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -U ${POSTGRES_USER:-example} -d ${POSTGRES_DB:-example}",
        ]

  backend:
    build:
      context: ./backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      SPRING_PROFILES_ACTIVE: docker
      SERVER_PORT: 8080
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB:-example}
      SPRING_DATASOURCE_USERNAME: ${POSTGRES_USER:-example}
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:-***}
    ports:
      - "${BACKEND_PORT:-8080}:8080"

  frontend:
    build:
      context: ./frontend
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      API_BASE_URL: http://backend:8080
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
    ports:
      - "${FRONTEND_PORT:-3000}:3000"

volumes:
  postgres-data:
```

---

## 이 파일을 읽을 때 먼저 봐야 하는 것

처음에는 설정이 길어 보여도, 인프라 관점에서는 아래 네 가지를 먼저 보면 구조가 잘 보인다.

- 어떤 서비스들이 있는가
- 누가 누구에게 의존하는가
- 내부에서는 어떤 이름으로 통신하는가
- 외부에는 어떤 포트를 열어두는가

이 기준으로 보면 이 Compose 파일은 꽤 명확하다.

```text
사용자
-> frontend:3000
-> backend:8080
-> postgres:5432
```

즉 프론트엔드가 사용자 요청의 진입점이 되고,  
프론트엔드는 백엔드를 호출하고, 백엔드는 다시 데이터베이스에 접근하는 구조다.

---

## 1. `postgres` 서비스: 데이터 저장소

`postgres`는 PostGIS가 포함된 PostgreSQL 이미지로 실행된다.

```yaml
image: postgis/postgis:16-3.4
```

즉 단순 PostgreSQL이 아니라, 위치 정보나 공간 데이터를 다뤄야 하기에 해당 버전을 사용하고 있다.

### 눈여겨볼 포인트

- `environment`: DB 이름, 사용자, 비밀번호를 환경변수로 주입한다.
- `ports`: 호스트의 5432 포트를 컨테이너의 5432 포트에 연결한다.
- `volumes`: 컨테이너가 재시작되어도 데이터가 유지되도록 볼륨을 사용한다.
- `healthcheck`: DB가 실제로 접속 가능한 상태인지 검사한다.

여기서 특히 중요한 것은 `volumes`와 `healthcheck`다.

`volumes`가 없으면 컨테이너를 다시 만들 때 데이터가 사라질 수 있고,  
`healthcheck`가 없으면 "컨테이너는 떴지만 DB는 아직 준비되지 않은 상태"를 구분하기 어렵다.

---

## 2. `backend` 서비스: API 서버

`backend`는 직접 Dockerfile로 빌드한 애플리케이션 컨테이너다.

```yaml
build:
  context: ./backend
```

즉 미리 만들어진 퍼블릭 이미지를 쓰는 것이 아니라,  
현재 저장소 안의 `./backend` 코드를 기준으로 이미지를 빌드한다는 뜻이다.

### 백엔드가 DB에 붙는 방식

가장 중요한 부분은 데이터베이스 접속 주소다.

```yaml
SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB:-example}
```

여기서 `postgres`는 IP 주소가 아니라 **Compose 내부 네트워크의 서비스 이름**이다.

즉 백엔드는 DB를 찾기 위해 `localhost`를 보지 않고,  
같은 Docker 네트워크 안의 `postgres` 컨테이너를 이름으로 찾아간다.

이 부분이 재미있었던 이유는,  
앞서 네트워크를 공부할 때 보았던 DNS 개념과 비슷하게  
"이름으로 상대를 식별한다"는 흐름이 로컬 컨테이너 환경에도 적용되기 때문이다.

### 왜 `depends_on`이 필요할까?

```yaml
depends_on:
  postgres:
    condition: service_healthy
```

이 설정은 백엔드가 무작정 먼저 뜨는 것이 아니라,  
Postgres가 **정상 상태(healthy)** 가 된 뒤에 시작되도록 돕는다.

초반 도커 환경으로 구성할 때 이 설정을 빠트려 CI 단계에서 계속 실패를 했었다.

---

## 3. `frontend` 서비스: 사용자 진입점

`frontend`는 사용자가 브라우저로 접근하는 웹 애플리케이션 컨테이너다.

```yaml
API_BASE_URL: http://backend:8080
```

- 프론트엔드는 내부 네트워크에서 `backend`라는 이름으로 API 서버를 찾고
- 그 백엔드의 8080 포트로 요청을 보낸다

즉 이 구조에서는 사용자가 직접 DB에 붙는 것이 아니라,

```text
브라우저
-> 프론트엔드
-> 백엔드 API
-> 데이터베이스
```

순서로 흐름이 이어진다.

이런 분리는 역할을 명확히 나눌 수 있다는 점에서 중요하다.

- 프론트엔드는 화면 렌더링과 사용자 상호작용 담당
- 백엔드는 비즈니스 로직 담당
- DB는 데이터 저장 담당

---

## 4. `ports`는 외부와 내부를 연결하는 문

Compose 파일을 읽을 때 자주 보이는 부분이 `ports`다.

예를 들어:

```yaml
ports:
  - "3000:3000"
```

는 다음 의미를 가진다.

- 왼쪽 `3000`: 호스트 머신에서 열어둘 포트
- 오른쪽 `3000`: 컨테이너 내부 애플리케이션이 사용하는 포트

즉 사용자는 로컬 브라우저에서 `http://localhost:3000`으로 접속하고,  
Docker는 그 요청을 프론트엔드 컨테이너의 3000번 포트로 전달한다.

같은 논리로:

- `5432:5432`는 DB 포트
- `8080:8080`은 백엔드 포트
- `3000:3000`은 프론트엔드 포트

를 호스트에 노출하는 설정이다.

인프라 관점에서는 이 부분을 보면서 "어떤 서비스가 외부에 공개되어야 하고, 어떤 서비스는 내부 통신만 하면 되는가"를 함께 생각하게 된다.

---

## 5. `healthcheck`는 왜 중요한가

컨테이너 환경에서 자주 생기는 문제 중 하나는  
"프로세스는 실행 중이지만, 서비스는 아직 준비되지 않은 상태"다.

예를 들어:

- Postgres 프로세스는 떴지만 아직 쿼리를 받을 준비가 안 되었을 수 있고
- 백엔드 프로세스는 떴지만 아직 DB 연결이 끝나지 않았을 수 있다

그래서 `healthcheck`를 이용해 진짜 준비 상태를 검사한다.

예를 들어 DB는:

```yaml
test: ["CMD-SHELL", "pg_isready -U ... -d ..."]
```

처럼 검사할 수 있고,

백엔드는:

```yaml
test:
  [
    "CMD-SHELL",
    "curl -fsS http://127.0.0.1:8080/actuator/health | grep -q 'UP'",
  ]
```

처럼 헬스 체크 엔드포인트를 확인할 수 있다.

이런 설정이 있으면 Compose는 단순히 "실행됨"이 아니라  
"정상 응답 가능"을 기준으로 다음 서비스를 이어서 올릴 수 있다.

---

## 6. 이 구성이 왜 CI/CD 환경 개선과 연결될까

처음에는 Compose가 로컬 개발용 도구처럼 보이지만,  
실제로는 CI/CD 환경을 더 안정적으로 만드는 데도 도움이 된다.

### 1) 환경 재현성이 좋아진다

개발자마다 로컬에 직접 DB를 설치하고,  
백엔드와 프론트엔드를 각자 다른 방식으로 실행하면 환경 차이로 인한 문제가 자주 생긴다.

하지만 Compose를 사용하면

```text
같은 이미지
같은 환경변수 구조
같은 의존성 순서
같은 포트 구조
```

를 기준으로 실행할 수 있어서, 단순 수동 빌드, 배포를 할 때 발생할 수 있는 문제를 줄이는 데 도움이 된다.

### 2) 파이프라인에서 통합 테스트 환경을 만들기 쉽다

CI에서 백엔드만 단독으로 테스트하는 것이 아니라  
DB까지 함께 띄워서 테스트하고 싶을 때 Compose 구성이 있으면 편하다.

예를 들어 아래처럼 생각할 수 있다.

```text
1. Compose로 postgres 실행
2. backend 실행 및 healthcheck 확인
3. API 테스트 수행
4. 필요하면 frontend까지 띄워 E2E 테스트 수행
```

즉 서비스 간 연결을 실제와 비슷한 형태로 재현한 뒤 검증할 수 있다.

### 3) 배포 전 검증 흐름을 구조화하기 좋다

운영 배포 전에 "애플리케이션이 혼자 뜨는가"보다  
"의존 서비스까지 포함해서 정상적으로 연결되는가"가 더 중요할 때가 많다.

Compose는 이런 점검을 사전에 자동화하기 좋은 형태로 제공한다.

---

## 마무리

이번 주에는 Docker Compose를 통해 실제로 내가 도커를 적용한 사례를 정리했다.

- 컨테이너끼리는 서비스 이름으로 서로를 찾는다.
- `ports`는 외부 호스트와 내부 컨테이너를 연결하는 통로다.
- `depends_on`과 `healthcheck`는 서비스 준비 순서를 안정적으로 만든다.
- 이런 구조는 로컬 개발뿐 아니라 CI/CD 환경 재현과 검증에도 도움이 된다.

결국 Docker Compose는 단순히 "여러 컨테이너를 한 번에 띄우는 도구"가 아니라, 서비스 간 연결과 실행 조건을 명시적으로 관리해주는 인프라 구성 도구라는 점이 이번 정리의 핵심이었다.

---

## 보충하기. 실제 프로젝트에서 빌드 전후 테스트를 어떻게 붙이고 있었는가

실제로는 Compose 파일만 있는 것이 아니라 빌드와 배포 전후를 검증하는 스크립트도 따로 만들었다.

### 1. 공통 체크 스크립트: `scripts/test/run_checks.sh`

핵심 흐름은 아래와 같다.

```bash
run_node_checks frontend
run_spring_boot_maven_checks backend
```

구체적으로는:

- 프론트엔드가 Node 프로젝트면 패키지 매니저를 감지한다
- `lint`, `typecheck`, `test` 스크립트가 있으면 자동으로 실행한다
- 백엔드는 Maven 프로젝트이기 때문에 `verify`를 실행한다

실제 스크립트 기준으로 보면 프론트엔드는 대략 아래 흐름이다.

```bash
pnpm lint
pnpm typecheck
pnpm test
```

백엔드는 아래처럼 검증한다.

```bash
./mvnw -B verify
```

즉 이 프로젝트에서는 "빌드 전에 최소한 어떤 체크를 통과해야 하는가"를 정리한 스크립트이다.

### 2. 프론트엔드에서 실제 사용하는 빌드/테스트 명령

`frontend/package.json`을 보면 실제 스크립트는 아래처럼 정의되어 있었다.

```json
"build": "next build --webpack",
"lint": "eslint .",
"typecheck": "tsc --noEmit -p tsconfig.typecheck.json",
"test": "vitest run"
```

즉 프론트엔드 기준의 기본 검증 흐름은 아래처럼 이해할 수 있다.

```text
lint
-> typecheck
-> test
-> build
```

이 순서를 거치면

- 문법/스타일 문제
- 타입 문제
- 단위 테스트 실패
- 실제 프로덕션 빌드 실패

를 비교적 앞단에서 빠르게 걸러낼 수 있다.

### 3. 백엔드에서 실제 사용하는 검증 명령

백엔드는 Spring Boot + Maven 기반이고,  
`pom.xml`에는 테스트 의존성과 `maven-surefire-plugin` 설정이 포함되어있다.

실제 공통 스크립트에서는 아래 명령을 사용한다.

```bash
./mvnw -B verify
```

`verify` 단계는 단순 컴파일만 하는 것이 아니라 테스트와 패키징 검증까지 포함하는 쪽에 가깝기 때문에, 백엔드 CI 체크로 두기 적절해 보였다.

또 `pom.xml`에는 아래처럼 Testcontainers 관련 의존성이 있는데,

- `org.testcontainers:junit-jupiter`
- `org.testcontainers:postgresql`

이런 구성은 백엔드 테스트에서 실제 DB와 유사한 환경을 재현하는 데 도움이 되었다.

### 4. 배포 스크립트도 단순 `up -d`는 아니다!

프로젝트에는 서비스별 배포 스크립트도 따로 있었다.

- `/Users/inho/Desktop/han/scripts/deploy/backend-deploy.sh`
- `/Users/inho/Desktop/han/scripts/deploy/frontend-deploy.sh`

이 스크립트들은 공통적으로 아래 흐름을 가진다.

```text
1. 현재 컨테이너의 이전 이미지 확인
2. docker compose pull
3. docker compose up -d
4. healthcheck 기반 검증
5. 실패하면 이전 이미지로 rollback
```

예를 들어 백엔드는 내부에서 아래 방식으로 헬스 체크를 확인한다.

```bash
curl -fsS http://127.0.0.1:8080/actuator/health | grep -q 'UP'
```

프론트엔드는 아래처럼 확인한다.

```bash
wget -qO- http://127.0.0.1:3000 >/dev/null 2>&1
```

즉 이 프로젝트에서는 배포도 단순히 새 이미지를 띄우는 것으로 끝나지 않고,

- 새 컨테이너가 정말 정상인지 확인하고
- 실패하면 이전 이미지로 되돌리는 흐름

까지 스크립트로 자동화하는 것을 목표로 하였다.
