# Startup Command Center
### Powered by AWS Bedrock AgentCore

The **Startup Command Center** is a full-stack multi-agent AI demo built on [AWS Bedrock AgentCore](https://aws.amazon.com/bedrock/agentcore/) using the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk). Submit any startup idea and instantly receive parallel analysis from a coordinated team of four AI specialists — all running simultaneously on AWS, streamed live to a React dashboard.

---

## Screenshots

### Welcome Screen
![Welcome Screen](docs/screenshots/welcome-screen.png)

### Dashboard — Live Multi-Agent Analysis
![Dashboard](docs/screenshots/dashboard.png)

---

## What It Does

You describe a startup idea in plain text. The **Business Advisor** (supervisor agent) receives your message, scopes it, then simultaneously delegates to four specialist subagents. Each specialist streams its response directly into its own panel as it arrives — no waiting for one to finish before the next starts.

| Agent | Role | Focus |
|---|---|---|
| **Business Advisor** | Supervisor | Synthesizes cross-functional strategy, asks clarifying questions |
| **Marketing Director (MD)** | Specialist | Go-to-market, customer acquisition, branding, competitive positioning |
| **Chief Financial Officer (CFO)** | Specialist | Unit economics, financial modeling, pricing, fundraising strategy |
| **Chief Technology Officer (CTO)** | Specialist | AWS architecture, serverless stack, MVP scoping, cloud infrastructure |
| **Chief Information Security Officer (CISO)** | Specialist | AWS security best practices, IAM, compliance, threat modeling |

Each specialist can ask the user **one targeted follow-up question**, rendered inline in its panel. Answering re-invokes only that specialist — the other panels are untouched.

---

## AWS Architecture

```
User Browser
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  AWS Amplify Hosting  (React / TypeScript / Vite)   │
│  • Tailwind CSS dark shell + light agent panels     │
│  • Cognito-authenticated SSE streaming              │
└─────────────────────────┬───────────────────────────┘
                          │  JWT (Authorization header)
                          ▼
┌─────────────────────────────────────────────────────┐
│  Amazon Cognito User Pool                           │
│  • OAuth2 Authorization Code flow (user login)      │
│  • JWT issued to frontend                           │
│  • Cognito Authorizer on API Gateway                │
└──────┬──────────────────┬──────────────────────────┘
       │ validates JWT     │ validates JWT
       ▼                   ▼
┌──────────────┐   ┌───────────────────────────────┐
│  API Gateway │   │  AWS Bedrock AgentCore Runtime │
│  REST API    │   │                               │
│  /documents  │   │  Supervisor Agent             │
│    /presign  │   │  (Claude Opus 4.6)            │
│    /extract  │   │  ┌─────────────────────────┐  │
│  /feedback   │   │  │  Parallel subagents      │  │
└──────┬───────┘   │  │  Marketing Director      │  │
       │           │  │  CFO                     │  │
       ▼           │  │  CTO        (Claude       │  │
┌──────────────┐   │  │  CISO        Sonnet 4.6) │  │
│  AWS Lambda  │   │  └─────────────────────────┘  │
│  (Python)    │   └───────────────┬───────────────┘
│  • Presigned │           M2M OAuth2 (Client Creds)
│    S3 URLs   │                   │
│  • Textract  │                   ▼
│    extract   │   ┌───────────────────────────────┐
└──────┬───────┘   │  AWS Bedrock AgentCore         │
       │           │  • Memory (cross-session)      │
       ▼           │  • Identity / Token Vault      │
┌──────────────┐   └───────────────────────────────┘
│  Amazon S3   │
│  Documents   │
│  Bucket      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Amazon      │
│  Textract    │
│  • PDF/PNG   │
│    text      │
│    extract   │
└──────────────┘
```

### How the AWS Services Work Together

1. **AWS Amplify** hosts the React frontend as a static site. The deploy script packages the built app and pushes it to an S3 staging bucket; Amplify serves it via CloudFront with a managed HTTPS domain.

2. **Amazon Cognito** handles user authentication via an OAuth2 Authorization Code flow. After login, the frontend holds a short-lived JWT access token that is passed in the `Authorization` header on every request.

3. **AWS Bedrock AgentCore Runtime** is the core service. The frontend calls the Runtime's invoke endpoint with the user's JWT (validated by Cognito). The Runtime runs the supervisor agent (Claude Opus 4.6) inside a Docker container on AgentCore managed infrastructure, then streams SSE events back to the browser.

4. **Multi-agent delegation**: The supervisor uses the Claude Agent SDK `Agent` tool to invoke four parallel specialist subagents (Claude Sonnet 4.6). Each subagent runs independently and streams its result back through the supervisor's SSE stream. The frontend parser identifies `subagent_start` and `subagent_result` events and routes each response to the correct panel.

5. **AgentCore Memory** provides cross-session context — the Runtime is configured with a Bedrock AgentCore Memory store so agents can recall information from prior conversations.

6. **AgentCore Identity / Token Vault** manages the machine-to-machine (M2M) OAuth2 credential exchange so the Runtime can call downstream AgentCore services (Gateway, Memory) without exposing secrets in application code.

7. **Amazon API Gateway** provides a secondary REST API for document upload and user feedback. Routes are protected by the same Cognito User Pools Authorizer.

8. **AWS Lambda (Python)** handles two document operations: generating pre-signed S3 PUT URLs for direct browser uploads, and extracting text from uploaded documents via Textract.

9. **Amazon S3** stores user-uploaded documents (PDFs, PNGs, CSVs, TXT files) under a per-agent/session prefix. Pre-signed URLs let the browser PUT files directly to S3 without routing them through the API.

10. **Amazon Textract** extracts text from PDF and image uploads so the content can be passed to the relevant specialist agent as additional context.

11. **AWS CDK (TypeScript)** provisions all infrastructure as code — Amplify app, Cognito User Pool, API Gateway, Lambda functions, S3 bucket, and the AgentCore Runtime — in a single `cdk deploy`.

---

## AWS Services Used

| Service | Purpose |
|---|---|
| **AWS Bedrock AgentCore Runtime** | Hosts and executes the multi-agent system |
| **AWS Bedrock AgentCore Memory** | Cross-session memory for agents |
| **AWS Bedrock AgentCore Identity** | M2M credential management (Token Vault) |
| **Amazon Bedrock** | Underlying model API (Claude Opus 4.6 + Sonnet 4.6) |
| **AWS Amplify Hosting** | React frontend hosting with CI/CD |
| **Amazon Cognito** | User authentication (OAuth2, JWT) |
| **Amazon API Gateway** | REST API for documents + feedback |
| **AWS Lambda** | Document presign + Textract extract handlers |
| **Amazon S3** | Document storage + Amplify staging bucket |
| **Amazon Textract** | PDF/image text extraction |
| **AWS CDK** | Infrastructure as Code |
| **AWS CloudFormation** | Underlying stack deployment |
| **AWS Systems Manager (SSM)** | Runtime config parameter storage |
| **Amazon CloudWatch** | Agent and Lambda logging |

---

## Key Features

- **Parallel multi-agent streaming** — all 4 specialists run simultaneously, not sequentially
- **Per-panel follow-up questions** — each specialist can request one clarification; the answer re-invokes only that specialist
- **Dark shell / light panels** — black app background with white lettering; specialist panels use light mode with color-coded accents
- **Document upload per panel** — upload PDFs, PNGs, CSVs, or TXT files as additional context for any specialist (stored in S3, extracted via Textract)
- **AWS-only CTO recommendations** — the CTO persona is an AWS Solutions Architect and names specific services (Lambda, DynamoDB, Cognito, etc.)
- **CISO specialist** — dedicated security advisor for AWS security best practices, IAM, and compliance, coordinated with the CTO

---

## Quick Deploy

```bash
# Prerequisites: Node.js, Python 3.8+, AWS CLI, Docker

# 1. Clone and configure
git clone <repo>
cd fullstack-solution-template-for-agentcore
# Edit infra-cdk/config.yaml — set stack_name_base and admin_user_email

# 2. Deploy infrastructure
cd infra-cdk
npm install
npx cdk bootstrap   # once per account/region
npx cdk deploy

# 3. Deploy frontend
cd ..
python3 scripts/deploy-frontend.py
```

The deploy script auto-loads `.env` from the project root. Create a `.env` file to pin your account/region:

```
AWS_PROFILE=<your-profile>
AWS_DEFAULT_REGION=us-east-1
```

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full deployment guide.

---

## Project Structure

```
fullstack-solution-template-for-agentcore/
├── patterns/
│   └── claude-agent-sdk-multi-agent/
│       ├── agent.py              # Supervisor agent + SSE streaming
│       └── agents/
│           └── subagents.py      # MD, CFO, CTO, CISO definitions
├── frontend/
│   └── src/components/dashboard/
│       ├── DashboardInterface.tsx # Main layout + event routing
│       ├── AgentPanel.tsx         # Per-specialist panel + follow-up UI
│       ├── DashboardHeader.tsx    # App header with agent status dots
│       └── agentConfig.ts         # Agent names, colors, labels
├── infra-cdk/
│   ├── lib/
│   │   ├── backend-stack.ts      # AgentCore Runtime + API Gateway + S3
│   │   ├── cognito-stack.ts      # Cognito User Pool
│   │   ├── amplify-hosting-stack.ts
│   │   └── fast-main-stack.ts    # Root stack + CDK outputs
│   └── lambdas/
│       ├── document-upload/      # Presign + Textract Lambda
│       └── feedback/             # Feedback API Lambda
├── scripts/
│   └── deploy-frontend.py        # Amplify deployment script
├── docs/
│   ├── screenshots/              # App screenshots
│   └── architecture-diagram/     # Architecture diagrams
└── infra-cdk/config.yaml         # Deployment configuration
```

---

## About FAST

This demo is built on the **Fullstack AgentCore Solution Template (FAST)** — a starter framework for deploying secured, web-accessible React frontends connected to AgentCore backends. FAST handles infrastructure, authentication, and streaming boilerplate so developers can focus on agent design and prompt engineering.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/awslabs/fullstack-solution-template-for-agentcore)

---

## Security

This asset is a proof-of-value demo and is not intended as a production-ready solution. You are responsible for applying appropriate security controls for your use case per the [AWS Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/).

## License

Apache-2.0
