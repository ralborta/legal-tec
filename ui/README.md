# Legal Agents - Frontend (Centro de Gestión)

Dashboard Next.js para gestión de documentos legales generados por IA.

## 🚀 Setup Local

### 1) Instalar dependencias

```bash
npm install
```

### 2) Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` y configura:
```
NEXT_PUBLIC_API_URL=https://tu-api.railway.app
```

(Reemplaza con la URL real de tu API en Railway)

### 3) Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## 📡 Funcionalidades

- ✅ **KPIs en tiempo real** (mock de momento)
- ✅ **Generación de documentos** (dictamen, contrato, memo, escrito)
- ✅ **Vista previa Markdown** con citas
- ✅ **Descarga de documentos** (.md)
- ✅ **Bandeja de solicitudes** (client-side por ahora)

---

## 🚢 Deploy en Vercel

### Opción A: Desde el Dashboard de Vercel

1. Ve a [vercel.com](https://vercel.com)
2. **Import Project** → Conecta tu repo de GitHub
3. **Root Directory**: `ui/`
4. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://tu-api.railway.app`
5. Deploy

### Opción B: Con Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
```

Durante el wizard:
- Root directory: `ui/`
- Framework: Next.js (auto-detected)
- Agrega la variable: `NEXT_PUBLIC_API_URL`

---

## 🔧 Troubleshooting

### Error de CORS

Si ves errores de CORS en el browser:
1. Asegúrate que el backend tenga `@fastify/cors` instalado
2. Verifica que el backend incluya tu dominio de Vercel en `origin`
3. El backend en Railway debe tener la configuración:
   ```ts
   await app.register(cors, {
     origin: ["http://localhost:3000", /\.vercel\.app$/]
   });
   ```

### API no responde

1. Verifica que `NEXT_PUBLIC_API_URL` esté correctamente configurada
2. Prueba el endpoint manualmente:
   ```bash
   curl https://tu-api.railway.app/health
   ```
3. Revisa los logs de Railway para ver errores del backend

---

## 📂 Estructura

```
ui/
├── app/
│   ├── dashboard/
│   │   └── page.tsx       # Dashboard principal (single-file)
│   ├── layout.tsx         # Layout raíz
│   └── globals.css        # Estilos Tailwind
├── public/
├── .env.example
└── package.json
```

---

## 🎨 Personalización

El dashboard está en un solo archivo: `app/dashboard/page.tsx`

Para producción, considera separarlo en componentes:
- `components/Sidebar.tsx`
- `components/KPIGrid.tsx`
- `components/GenerarPanel.tsx`
- `components/BandejaLocal.tsx`

---

## 🔜 Próximas mejoras

- [ ] Persistencia de documentos (conectar con DB vía API)
- [ ] Autenticación (NextAuth.js + Supabase Auth)
- [ ] Exportación a PDF
- [ ] KPIs reales (endpoint `/v1/metrics` en API)
- [ ] Upload de archivos adjuntos
- [ ] Historial de revisiones
