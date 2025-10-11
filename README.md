## LecSum AI — Backend

### Propósito
Este servicio provee la API y la lógica del lado del servidor para LecSum AI: creación de flashcards y quizzes con IA, y chat con IA sobre documentos subidos por el usuario.

### Tech Stack
- NestJS
- PostgreSQL
- OpenAI
- Gemini
- (Frontend del proyecto: Next.js + Tailwind CSS v4)

### Cómo ejecutarlo localmente
1) Instalar dependencias:
   - `npm install`
2) Ejecutar en desarrollo:
   - `npm run start:dev`

Configura tus variables de entorno para la conexión a PostgreSQL y las claves de OpenAI/Gemini y Pinecone antes de iniciar.

### Configuración rápida (.env)
- Archivo: crea `lecsum-ai-backend/.env` (puedes guiarte con `.env.example`).
- Variables principales:
   - Servidor
      - `PORT`: Puerto del backend. Ej: `3001`.
      - `ENVIRONMENT`: Entorno (`development` | `production`). Controla `synchronize` de TypeORM.
      - `FRONTEND_URL`: Origen permitido para CORS. Ej: `http://localhost:3000`.
      - `NODE_OPTIONS`: Flags de Node. Ej: `--max_old_space_size=4096`.
   - Autenticación
      - `JWT_SECRET`: Secreto para firmar tokens JWT.
   - Base de datos (PostgreSQL)
      - `DATABASE_HOST`: Host de la DB. Ej: `localhost`.
      - `DATABASE_PORT`: Puerto de la DB. Ej: `5432`.
      - `DATABASE_USERNAME`: Usuario de la DB. Ej: `postgres`.
      - `DATABASE_PASSWORD`: Contraseña de la DB.
      - `DATABASE_NAME`: Nombre de la base. Ej: `lecsum`.
   - IA (Gemini)
      - `GEMINI_API_KEY`: API key de Gemini para generación de contenido.
   - Vector DB (Pinecone)
      - `PINECONE_API_KEY`: API key de Pinecone.
      - `PINECONE_INDEX_NAME`: Nombre del índice en Pinecone.
      - `PINECONE_INDEX_HOST`: Host del índice de Pinecone.
   - Archivos y almacenamiento
      - `UPLOADS_DIR`: Carpeta local para subidas. Ej: `uploads`.
      - `GCS_BUCKET_NAME`: Bucket de Google Cloud Storage (opcional si usas GCS).
      - `GCS_ACCESS_TOKEN`: Token de acceso para GCS (opcional si usas GCS).

### URL de acceso
Frontend en producción: https://lecsum-ai-frontend.vercel.app/
