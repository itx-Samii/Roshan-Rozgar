// Vercel Function entry: one function serves every /api/* route (ADR-014).
// App code lives in ../server so Vercel does not create one function per file.
import { createApp } from '../server/app.js'

export default createApp()
