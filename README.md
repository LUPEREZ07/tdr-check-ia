# TDR Check IA

MVP para revisar Términos de Referencia y detectar únicamente posibles:

- inconsistencias de cantidades;
- inconsistencias de plazos o fechas;
- requisitos contradictorios;
- información ambigua o insuficientemente definida;
- incongruencias entre objeto y actividades.

La entrada admite texto pegado y archivos `.txt`, `.md`, `.docx` o `.pdf` con texto seleccionable.

La aplicación no determina legalidad ni emite conclusiones jurídicas. Cada resultado es un punto de revisión humana.

## Ejecutar

```bash
pnpm install
pnpm dev
```

La interfaz se abre en `http://localhost:5173`. El servidor de desarrollo incluye un middleware local para probar las mismas rutas `/api/` de Vercel.

## Configurar servicios

Copia `.env.example` a `.env` y agrega:

- `OLLAMA_API_KEY` para analizar con Ollama Cloud. El modelo predeterminado es `gpt-oss:120b-cloud`.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` para persistir el historial en Supabase. La service role key solo se usa en Functions y nunca se incluye en el frontend.

Sin credenciales, la interfaz usa una revisión local de respaldo para que el MVP se pueda probar. En producción se recomienda configurar ambos servicios.

En Vercel, el archivo SQLite local es temporal por la naturaleza serverless; el historial durable se consulta y guarda en Supabase cuando sus variables están configuradas.

## Supabase

Ejecuta el contenido de [`supabase/schema.sql`](./supabase/schema.sql) en el SQL Editor de tu proyecto. La tabla tiene RLS activado y no expone permisos anónimos; las Functions escriben usando la clave de servidor.

## Vercel

El frontend se construye con `pnpm build` y las rutas de `api/` son Vercel Functions de Node.js. Configura las variables de entorno del `.env.example` en el proyecto de Vercel antes de publicar.
