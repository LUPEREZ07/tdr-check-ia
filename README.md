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
- `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` para autenticar las Functions y acceder a Supabase respetando RLS.

La aplicación requiere iniciar sesión para analizar y consultar el historial. La revisión local de respaldo de IA solo se usa si Ollama Cloud no está configurado; la persistencia siempre se realiza en Supabase.

En Vercel, configura estas variables en el entorno de producción:

- `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` para las Functions del servidor.
- `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` para el frontend. La publishable key es segura para el navegador cuando RLS está correctamente configurado.
- `VITE_SITE_URL` con la URL pública actual. En producción: `https://tdr-check-ia-fabricum-curso.vercel.app`.

## Supabase

Ejecuta el contenido de [`supabase/schema.sql`](./supabase/schema.sql) en el proyecto `TDR CHECK IA`. La tabla exige `user_id`, tiene RLS activado y solo permite a cada usuario leer e insertar sus propias filas.

En Authentication > Providers > Email, desactiva **Confirm email** para que el registro permita ingresar sin confirmar el correo. En Authentication > URL Configuration, establece como Site URL `https://tdr-check-ia-fabricum-curso.vercel.app` y agrega esa misma URL a Redirect URLs.

## Vercel

El frontend se construye con `pnpm build` y las rutas de `api/` son Vercel Functions de Node.js. Configura las variables de entorno del `.env.example` en el proyecto de Vercel antes de publicar.
