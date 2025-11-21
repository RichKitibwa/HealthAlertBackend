# HealthAlert - Backend


## Clone repo

In the directory you want to place the code, run;

```bash
git clone https://github.com/RichKitibwa/HealthAlertBackend.git
cd health_app_backend
```

##  Architecture

##  Project Structure

```
functions/
├── src/
│   ├── index.ts                       # Main entry point
│   │
│   ├── models/                        # Data models
│   │   └── user.model.ts             # User interfaces & enums
│   │
│   ├── services/                      # Business logic
│   │   └── user.service.ts           # User database operations
│   │
│   ├── controllers/                   # Cloud Functions
│   │   ├── auth.controller.ts        # Authentication functions
│   │   └── user.controller.ts        # User management functions
│   │
│   └── utils/                         # Helpers
│       ├── validators.ts             # Input validation
│       └── responses.ts              # Response formatting
│
├── package.json
├── tsconfig.json
└── README.md
```

##  Getting Started

### Prerequisites

- Node.js 22
- Firebase CLI
- Firebase project created

### 1. Install Firebase CLI

```bash
npm install -g firebase-tools
```

### 2. Login to Firebase

```bash
firebase login
```

### 3. Initialize Project (if not done)

```bash
# In the backend directory
firebase init

# Select:
# - Functions (TypeScript)
# - Firestore
# - Use existing project
```

### 4. Install Dependencies

```bash
cd functions
npm install
```

### 5. Build TypeScript

```bash
npm run build
```

### 6. Deploy to Firebase

```bash
# From backend root directory
firebase deploy --only functions,firestore:rules
```

##  Available Cloud Functions

### Authentication Functions

#### `registerUser`
Creates a new user account.

**Request:**
```json
{
  "firstName": "John",
  "lastName": "Mukasa",
  "phoneNumber": "+256700123456",
  "role": "VHT"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "user_id",
    "firstName": "John",
    "lastName": "Mukasa",
    "phoneNumber": "+256700123456",
    "role": "VHT",
    "createdAt": "2025-11-20T10:00:00.000Z"
  }
}
```

**Valid Roles:**
- `VHT`
- `Ambulance Driver`
- `Clinic Staff`
- `Admin`

#### `loginUser`
Authenticates user by phone number.

**Request:**
```json
{
  "phoneNumber": "+256700123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": { /* user object */ }
}
```

### User Management Functions

#### `getUserById`
Retrieves user information.

**Request:**
```json
{
  "userId": "user_id"
}
```

#### `updateUserProfile`
Updates user information.

**Request:**
```json
{
  "userId": "user_id",
  "firstName": "Jane",
  "lastName": "Smith",
  "phoneNumber": "+256700999888"
}
```

#### `getUsersByRole`
Gets all users with specific role.

**Request:**
```json
{
  "role": "VHT"
}
```

**Response:**
```json
{
  "success": true,
  "users": [ /* array of users */ ],
  "count": 5
}
```

#### `getAllUsers`
Retrieves all users (Admin only - auth to be added).

**Request:** Empty

#### `deleteUser`
Deletes a user account.

**Request:**
```json
{
  "userId": "user_id"
}
```

## 🗄️ Firestore Collections

### `users`

**Schema:**
```typescript
{
  id: string;                   
  firstName: string;            
  lastName: string;              
  phoneNumber: string;          
  role: string;                  
  createdAt: string;             
  updatedAt?: string;            
}
```

**Example:**
```json
{
  "id": "abc123",
  "firstName": "Jane",
  "lastName": "Doe",
  "phoneNumber": "+256700123456",
  "role": "VHT",
  "createdAt": "2025-11-20T10:00:00.000Z"
}
```

## 🛠️ Development

#### Start Firebase Emulator

```bash
# From backend root
firebase emulators:start
```

#### Watch Mode (Auto-rebuild)

```bash
cd functions
npm run build:watch
```

##  Deployment

### Deploy Everything

```bash
firebase deploy
```

### Deploy Only Functions

```bash
firebase deploy --only functions
```

### Deploy Specific Function

```bash
firebase deploy --only functions:registerUser
```

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

