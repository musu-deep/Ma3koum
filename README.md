# Ma3koum | معكم

تم رفع مشروع **معكم** من الأرشيف الأصلي المرفق مع الحفاظ على كامل ملفاته ومحتواه.

## التشغيل المحلي

```bash
npm install
npm run dev
```

عند أول تشغيل، ينفّذ `scripts/unpack.cjs` فك ملفات المشروع الأصلية تلقائياً من الأجزاء المحفوظة داخل `.upload/`، ثم يضبط الخادم ليستمع إلى متغير `PORT` المطلوب في Google Cloud Run.

## أوامر المشروع

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## متغيرات البيئة

انسخ ملف المثال بعد فك المشروع:

```bash
cp .env.example .env
```

ثم أضف القيم المطلوبة محلياً. لا تُرفع ملفات `.env` الحقيقية إلى المستودع.

## النشر على Google Cloud Run

المستودع يحتوي على `Dockerfile` متعدد المراحل ومهيأ للاستماع على المنفذ الذي يرسله Cloud Run.

بعد تثبيت وتهيئة Google Cloud CLI واختيار المشروع:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

أنشئ مفتاح Gemini في Secret Manager، ثم امنح حساب تشغيل Cloud Run صلاحية `Secret Manager Secret Accessor` على السر.

بعد ذلك انشر من مجلد المشروع:

```bash
gcloud run deploy ma3koum \
  --source . \
  --region YOUR_REGION \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

عند نجاح النشر يعرض Google Cloud رابط الخدمة مباشرة.
