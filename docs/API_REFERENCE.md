# Oru'el GPU Relay API Reference

Welcome to the **Oru'el GPU Relay API**. This API acts as a high-performance proxy and lifecycle relay for Spheron AI's GPU infrastructure. 

By integrating with this API, you get direct programmatic access to rent, manage, and scale GPU instances, persistent volumes, and Kubernetes resources.

---

## 1. Getting Started

### Base URL
All API requests must be made to the following base endpoint:
```
https://relay.oru-el.com/api
```

### Authentication
To authenticate requests, you must supply the API key issued to you by Oru'el in the `X-API-Key` HTTP header.
- Do not share this API key.
- Never hardcode the API key in client-side applications.

**Header Format:**
```http
X-API-Key: oruel_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

**cURL Authentication Example:**
```bash
curl -H "X-API-Key: oruel_live_YOUR_API_KEY_HERE" \
     https://relay.oru-el.com/api/providers
```

---

## 2. Pricing & Markup

All currency values (lowestPrice, price, hourlyRate, totalCost, etc.) returned by the Oru'el Relay API are in **USD** and **already include a 20% markup** (or the current Oru'el partnership rate). 

There is no need to manually calculate markups on your end; the rate you see is the exact billing rate you accrue.

---

## 3. Rate Limits

Throttling is applied per-client (associated with your API key) to protect upstream providers:
*   **General Endpoints:** Maximum of `250 requests` per 15-minute window.
*   **Deployment Creation (`POST /deployments`):** Maximum of `10 requests` per 15-minute window.

If you exceed these limits, the API returns a `429 Too Many Requests` status code.

---

## 4. Endpoints Reference

### Providers
#### `GET /providers`
Lists all supported hardware and bare-metal GPU cloud providers.

*   **Request Example:**
    ```bash
    curl -H "X-API-Key: $ORUEL_API_KEY" https://relay.oru-el.com/api/providers
    ```
*   **Response Example (200 OK):**
    ```json
    ["voltage-park", "data-crunch", "massed-compute", "sesterce", "spheron-ai"]
    ```

---

### GPU Offers
#### `GET /gpu-offers`
Retrieve the real-time paginated catalog of available GPU configurations across all providers.

*   **Query Parameters:**
    *   `page` (integer, default: `1`): Page number to fetch.
    *   `limit` (integer, default: `10`): Number of GPU model groups per page.
    *   `search` (string, optional): Filter by GPU name (e.g. `rtx-4090`, `h100`).
    *   `sortBy` (string, default: `popularity`): Field to sort by.
    *   `sortOrder` (string, default: `asc`): Sort order (`asc` or `desc`).
    *   `instanceType` (string, optional): filter by `SPOT`, `DEDICATED`, or `CLUSTER`.

*   **Response Example (200 OK):**
    ```json
    {
      "data": [
        {
          "gpuType": "rtx-4090",
          "gpuModel": "RTX 4090",
          "displayName": "NVIDIA GeForce RTX 4090",
          "popularity": 95,
          "totalAvailable": 12,
          "lowestPrice": 0.588,
          "highestPrice": 0.828,
          "averagePrice": 0.708,
          "providers": ["massed-compute", "sesterce"],
          "offers": [
            {
              "provider": "massed-compute",
              "offerId": "offer-mc-4090-single",
              "name": "Single RTX 4090 Dedicated",
              "description": "NVIDIA RTX 4090 with Ubuntu 22.04 LTS",
              "vcpus": 8,
              "memory": 32,
              "storage": 100,
              "gpuCount": 1,
              "price": 0.588,
              "available": true,
              "region": "us-east",
              "gpu_memory": 24,
              "os_options": ["ubuntu-22.04"],
              "instanceType": "DEDICATED",
              "interconnectType": "PCIe",
              "supportsCloudInit": true
            }
          ]
        }
      ],
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
    ```

---

### Deployments
#### `POST /deployments`
Launches a new GPU instance or Kubernetes cluster.

*   **Request Body (JSON):**
    *   `provider` (string, required): Upstream provider ID (e.g. `massed-compute`).
    *   `offerId` (string, required): The target `offerId` from `/gpu-offers`.
    *   `gpuType` (string, required): Hardware type (e.g. `rtx-4090`).
    *   `gpuCount` (integer, required): Number of GPUs to rent.
    *   `region` (string, required): Deployment region identifier.
    *   `operatingSystem` (string, required): OS image identifier.
    *   `instanceType` (string, required): `SPOT`, `DEDICATED`, or `CLUSTER`.
    *   `sshKeyId` (string, optional): ID of a previously uploaded SSH key.
    *   `ssh_public_key` (string, optional): Literal SSH public key text to inject.
    *   `name` (string, optional): Custom friendly name for your deployment.
    *   `cloudInit` (object, optional): Custom startup script config (`runcmd`, `packages`, `writeFiles`).
    *   `volumeIds` (array of strings, optional): Volumes to attach at runtime.

*   **Request Example:**
    ```bash
    curl -X POST -H "X-API-Key: $ORUEL_API_KEY" \
         -H "Content-Type: application/json" \
         -d '{
           "provider": "massed-compute",
           "offerId": "offer-mc-4090-single",
           "gpuType": "rtx-4090",
           "gpuCount": 1,
           "region": "us-east",
           "operatingSystem": "ubuntu-22.04",
           "instanceType": "DEDICATED",
           "ssh_public_key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."
         }' \
         https://relay.oru-el.com/api/deployments
    ```

*   **Response Example (201 Created):**
    ```json
    {
      "id": "dep-9a3b8c2d1e",
      "name": "instance-rtx-4090",
      "providerId": "massed-compute",
      "gpuType": "rtx-4090",
      "offerId": "offer-mc-4090-single",
      "gpuCount": 1,
      "region": "us-east",
      "status": "deploying",
      "hourlyRate": 0.588,
      "totalCost": 0.00,
      "vcpus": 8,
      "memory": 32,
      "storage": 100,
      "createdAt": "2026-07-20T10:00:00Z"
    }
    ```

#### `GET /deployments`
List all running and terminated GPU deployments launched with **your** API key.
*   **Query Parameters:**
    *   `status` (string, optional): Filter by `active`, `inactive`, `running`, `deploying`, `terminated`, `failed`.

#### `GET /deployments/{id}`
Returns real-time configuration, status, IP address, and connection details for a specific deployment.
*   **Response Example (200 OK):**
    ```json
    {
      "id": "dep-9a3b8c2d1e",
      "name": "instance-rtx-4090",
      "providerId": "massed-compute",
      "gpuType": "rtx-4090",
      "offerId": "offer-mc-4090-single",
      "gpuCount": 1,
      "region": "us-east",
      "status": "running",
      "ipAddress": "198.51.100.42",
      "sshCommand": "ssh root@198.51.100.42 -p 22",
      "sshPort": 22,
      "hourlyRate": 0.588,
      "totalCost": 1.176,
      "createdAt": "2026-07-20T10:00:00Z"
    }
    ```

#### `PATCH /deployments/{id}`
Update mutable settings of a deployment.
*   **Request Body:**
    *   `name` (string): The new name of the instance.

#### `DELETE /deployments/{id}`
Terminates a deployment immediately and stops billing accrual.
*   **Response Example (200 OK):**
    ```json
    {
      "message": "Instance destruction initiated",
      "deployment": {
        "id": "dep-9a3b8c2d1e",
        "status": "terminated",
        "stoppedAt": "2026-07-20T12:00:00Z"
      }
    }
    ```

#### `GET /deployments/{id}/can-terminate`
Check if the instance can be terminated (certain bare-metal providers enforce minimum runtime constraints).
*   **Response Example (200 OK):**
    ```json
    {
      "canTerminate": true,
      "runtime": 120,
      "minimumRuntime": 60,
      "timeRemaining": 0
    }
    ```

---

### SSH Keys
Manage public keys utilized to secure and log in to newly provisioned deployments.

#### `GET /ssh-keys`
List SSH keys added to your key workspace.

#### `POST /ssh-keys`
Add an SSH key.
*   **Request Body (JSON):**
    *   `name` (string, required): Friendly identifier for the key.
    *   `publicKey` (string, required): OpenSSH format public key content.

#### `DELETE /ssh-keys/{id}`
Remove a public SSH key from your workspace.

---

### Volumes (Persistent Storage)
Renting external block storage and managing attachments.

#### `GET /volumes`
List storage volumes.
*   **Query Parameters:**
    *   `page` (integer)
    *   `limit` (integer)
    *   `status` (string, optional): `available`, `attached`, `deleting`.

#### `POST /volumes`
Create a persistent storage volume.
*   **Request Body (JSON):**
    *   `name` (string, required): Lowercase alphanumeric name with hyphens.
    *   `sizeInGb` (integer, required): Volume capacity in GB.
    *   `provider` (string, required): Storage provider ID (e.g. `voltage-park`).
    *   `region` (string, required): Target region.

#### `DELETE /volumes/{volumeId}`
Deletes a volume (must be detached first).

#### `POST /volumes/{volumeId}/attach`
Attach volume to a running deployment.
*   **Request Body (JSON):**
    *   `deploymentId` (string, required): Target instance deployment ID.

#### `POST /volumes/{volumeId}/detach`
Detach volume from an instance.

#### `GET /volumes/pricing`
Get storage rates per GB per hour (including Oru'el markup).

---

### Kubernetes (Voltage Park Clusters Only)
#### `GET /kubernetes/versions`
Fetch supported Kubernetes engine versions.

#### `GET /kubernetes/{clusterId}/health`
Obtain current health and status metrics of a running cluster.

---

## 5. Error Reference

Standard HTTP response status codes are returned to indicate the success or failure of an API request:

| Code | Type | Meaning |
|---|---|---|
| `200` | Success | Request succeeded. |
| `201` | Success | Resource created successfully. |
| `400` | Bad Request | Missing or invalid parameters in body/query. |
| `401` | Unauthorized | Missing or invalid `X-API-Key` header. |
| `404` | Not Found | Target resource does not exist or belongs to another client. |
| `429` | Rate Limited | Too many requests in a short period. |
| `500` | Server Error | Internal gateway or upstream error. |

*   **Error Response Body Shape:**
    ```json
    {
      "error": "Brief description of the error",
      "code": "ERROR_CODE",
      "details": {}
    }
    ```

---

## 6. End-to-End Workflow Example

The following scenario shows how to search for resources, create an SSH key, provision a GPU instance, and terminate it.

### Step 1: Browse for RTX 4090 Offers
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
     "https://relay.oru-el.com/api/gpu-offers?search=rtx-4090&instanceType=DEDICATED"
```
Record the chosen `offerId`, `provider`, and `region` from the response.

### Step 2: Upload Your Public SSH Key
```bash
curl -X POST -H "X-API-Key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "dev-laptop",
       "publicKey": "ssh-rsa AAAAB3Nza..."
     }' \
     https://relay.oru-el.com/api/ssh-keys
```
Note the returned `"id"` (e.g., `key-12345`) representing the uploaded key.

### Step 3: Launch the GPU Instance
```bash
curl -X POST -H "X-API-Key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "provider": "massed-compute",
       "offerId": "offer-mc-4090-single",
       "gpuType": "rtx-4090",
       "gpuCount": 1,
       "region": "us-east",
       "operatingSystem": "ubuntu-22.04",
       "instanceType": "DEDICATED",
       "sshKeyId": "key-12345"
     }' \
     https://relay.oru-el.com/api/deployments
```
Record the deployment `"id"` (e.g. `dep-abcde`). The initial status will be `"deploying"`.

### Step 4: Poll Instance Status Until Running
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
     https://relay.oru-el.com/api/deployments/dep-abcde
```
Once the status changes to `"running"`, copy the `"ipAddress"` or `"sshCommand"` to access your VM.

### Step 5: Terminate Instance (Stop Billing)
```bash
curl -X DELETE -H "X-API-Key: YOUR_API_KEY" \
     https://relay.oru-el.com/api/deployments/dep-abcde
```
Your instance is deleted, and billing terminates instantly.
