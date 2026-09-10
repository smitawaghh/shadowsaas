# ShadowsSaaS

**ShadowsSaaS** is a network security monitoring platform designed to inspect network traffic, detect suspicious activity, generate security alerts, and provide real-time system visibility through a web-based monitoring dashboard.

The platform combines a **FastAPI backend**, **React frontend**, packet inspection, structured logging, health monitoring, and automated notifications into a single security monitoring workflow.

## Key Features

* **Network Packet Inspection**

  * Captures and inspects network traffic to identify potentially suspicious activity.
  * Provides a foundation for traffic-level security monitoring.

* **Security Alerting**

  * Generates alerts when suspicious network activity is detected.
  * Supports notifications through **email and Slack webhooks**.

* **Monitoring Dashboard**

  * React-based dashboard for viewing monitoring information and security alerts.
  * Provides centralized visibility into system activity.

* **Structured Logging**

  * Implements rotating file logging.
  * Uses a **5 MB rotating log configuration** to prevent uncontrolled log growth.

* **System Health Monitoring**

  * Dedicated health endpoint reports the status of important platform components.
  * Tracks database, machine-learning, packet-sniffing, uptime, and alert information.

* **REST API**

  * FastAPI backend exposes APIs for communication between the security-monitoring services and frontend.

* **Cloud Deployment**

  * Backend deployed on **AWS EC2**.
  * Configured with **systemd** for service management and **Nginx** for reverse proxying.

## Architecture

```text
Network Traffic
       │
       ▼
Packet Inspection
       │
       ▼
Detection / Analysis
       │
       ├──────────────► Security Alerts
       │                    │
       │                    ├── Email
       │                    └── Slack
       │
       ▼
FastAPI Backend
       │
       ├──────────────► Health Monitoring
       │
       ├──────────────► Structured Logging
       │
       ▼
React Monitoring Dashboard
       │
       ▼
      Nginx
       │
       ▼
    AWS EC2
```

## Technology Stack

### Backend

* Python
* FastAPI
* REST APIs

### Frontend

* React
* JavaScript
* JSX

### Security & Monitoring

* Network packet inspection
* Security alerting
* Health monitoring
* Rotating logs

### Notifications

* Email
* Slack Webhooks

### Cloud & Deployment

* AWS EC2
* Nginx
* systemd

## Engineering Focus

The project focuses on building a complete security-monitoring workflow rather than an isolated detection component. It combines traffic inspection with backend services, observability, automated alerting, and a user-facing monitoring interface.

This project demonstrates practical experience with:

* Backend API development
* Network security concepts
* Full-stack application development
* Monitoring and observability
* Automated alerting
* Linux service management
* Cloud deployment
* RESTful architecture
* Frontend-backend integration
