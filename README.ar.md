<div dir="rtl" align="right">

<div align="center">

<img src="docs/screenshots/desktop/02-dashboard.png" alt="لوحة تحكم مسار" width="860">

# مسار — منصة إدارة النقل واللوجستيات

**من البوليصة إلى الفاتورة — في مكان واحد.**
بوالص شحن · لوحة توزيع · تتبع مباشر بالـGPS · إثبات تسليم · تحصيل COD · تعرفة وفواتير · تقارير — كـ**موقع** و**تطبيق أندرويد (APK)**، بالعربية (RTL) والإنجليزية.

[English](README.md) · [تحليل النظام الأصلي والأفكار](docs/ANALYSIS.md) · [**تنزيل الـAPK**](releases/masar-logistics-v1.0.apk)

</div>

---

## ما هو؟

«مسار» نظام تشغيل متكامل لشركة نقل بري. بدأ من قراءة معمّقة لوحدة **Laravel / Bagisto** لوجستية داخل نظام ERP (بوليصة الشحن، السائقون، المستلمون، إدارة التسليم، التحقق ← أمر بيع ← فاتورة، تقريران، الطباعة مع QR، وفكرة تتبع مباشر لم تكتمل). أعدت بناء كل هذا كمنتج مستقل: خادم **FastAPI** وواجهة **Next.js**، وسددت كل الثغرات التي تركها الأصل — التفاصيل في [docs/ANALYSIS.md](docs/ANALYSIS.md).

نفس الكود يعمل بثلاث طرق:

| الوضع | ما يعمل | الاستخدام |
|---|---|---|
| **وضع الخادم** | موقع Next.js ثابت ← **FastAPI** + SQLite/PostgreSQL | النظام الحقيقي |
| **الوضع المحلي** (`NEXT_PUBLIC_LOCAL=1`) | كل الـAPI معاد تنفيذه داخل المتصفح، والبيانات في `localStorage` | معرض الأعمال والتجربة بدون خادم |
| **تطبيق أندرويد** | الوضع المحلي داخل Capacitor (GPS، كاميرا، مشاركة، طابور بدون إنترنت) | الهواتف — يعمل بلا خادم إطلاقاً |

## الشاشات

<table>
<tr>
<td width="50%"><img src="docs/screenshots/desktop/04-waybill-in-transit.png"><br><sub><b>البوليصة</b> — مراحل التنفيذ، الشاحنة على الخريطة، الوصول المتوقع، رمز التأكيد ورابط التتبع، السجل الزمني</sub></td>
<td width="50%"><img src="docs/screenshots/desktop/09-live-tracking.png"><br><sub><b>التتبع المباشر</b> — كل الشاحنات على الطريق مع الوصول المتوقع والمسافة المتبقية</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/desktop/08-dispatch-board.png"><br><sub><b>لوحة التوزيع</b> — اسحب البطاقة إلى السائق (يُسمح فقط بالسائقين المرتبطين بالعميل)</sub></td>
<td><img src="docs/screenshots/desktop/06-waybill-form.png"><br><sub><b>بوليصة جديدة</b> — تعبئة تلقائية، طرود بإجماليات، رابط Google أو Plus Code ← إحداثيات</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/desktop/11-billing-verify.png"><br><sub><b>التحقق والتسعير</b> — تعرفة مقترحة ومعاينة السعر ثم الفوترة</sub></td>
<td><img src="docs/screenshots/desktop/13-invoice.png"><br><sub><b>فاتورة ضريبية</b> — ضريبة، دفعات، QR، جاهزة للطباعة</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/desktop/07-waybill-print.png"><br><sub><b>البوليصة المطبوعة</b> مع QR إلى صفحة التتبع</sub></td>
<td><img src="docs/screenshots/desktop/22-public-tracking.png"><br><sub><b>التتبع العام</b> — بدون حساب: رقم البوليصة + آخر 4 أرقام من هاتف المستلم (أو الرمز)</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/desktop/15-reports-trip-sheet.png"><br><sub><b>التقارير</b> — كشف الرحلات، حالة الشحنات، السائقون، الإيرادات، أعمار الديون · CSV لـExcel</sub></td>
<td><img src="docs/screenshots/desktop/10-delivery-grid.png"><br><sub><b>إدارة التسليم</b> — تعديل جماعي للحالة والسائق والموقع والمسافة والمستلم</sub></td>
</tr>
</table>

### تطبيق السائق

<table>
<tr>
<td align="center"><img src="docs/screenshots/mobile/02-driver-jobs.png" width="200"><br><sub>مهامي + مشاركة الموقع</sub></td>
<td align="center"><img src="docs/screenshots/mobile/03-driver-job.png" width="200"><br><sub>المهمة: ملاحة، اتصال، الخطوة التالية</sub></td>
<td align="center"><img src="docs/screenshots/mobile/04-driver-proof-of-delivery.png" width="200"><br><sub>إثبات التسليم: توقيع، صورة، رمز، COD</sub></td>
<td align="center"><img src="docs/screenshots/mobile/08-live-tracking.png" width="200"><br><sub>الخريطة الحية على الهاتف</sub></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/mobile/05-client-dashboard.png" width="200"><br><sub>بوابة العميل</sub></td>
<td align="center"><img src="docs/screenshots/mobile/07-dispatch.png" width="200"><br><sub>التوزيع على الجوال</sub></td>
<td align="center"><img src="docs/screenshots/desktop/25-english-dashboard.png" width="200"><br><sub>English / LTR</sub></td>
<td align="center"><img src="docs/screenshots/desktop/27-dark-dashboard.png" width="200"><br><sub>المظهر الداكن</sub></td>
</tr>
</table>

## المزايا

### خمسة أدوار، والصلاحيات تُفرض في الخادم (وليس بإخفاء القوائم)

| الدور | ماذا يفعل |
|---|---|
| **مدير النظام** | كل شيء + المستخدمون وقواعد الشركة وسجل التدقيق |
| **منسّق العمليات** | البوالص، لوحة التوزيع، إدارة التسليم، التتبع، البيانات الأساسية، التقارير التشغيلية |
| **المحاسب** | التحقق والتسعير، الفواتير، المدفوعات، تسوية COD، التعرفة، الإيرادات وأعمار الديون وكشوف الحساب |
| **العميل** | بوابته: ينشئ بوالصه ويرحّلها ويتتبعها ويرى فواتيره — لا يرى سوى شركته |
| **السائق** | تطبيق الجوال: المهام، أزرار المراحل، مشاركة الموقع، إثبات التسليم، وطابور بدون إنترنت |

### دورة حياة البوليصة
`جديدة ← مرحّلة ← تم التسليم ← تم التحقق ← مفوترة` (أو `ملغاة`)، وتحتها مراحل تنفيذ أدق: *بانتظار سائق ← معيّنة ← قبِل ← استلم ← في الطريق ← وصل ← سُلّمت* (أو *فشل التسليم* فيعود للتوزيع).

### أبرز ما فيه
- **ترقيم تلقائي** بقواعد الأصل: تلقائي / تلقائي مع إمكانية الكتابة اليدوية / يدوي فقط؛ ولا يُستهلك الرقم إلا بعد حفظ ناجح.
- **GPS في كل مكان**: الصق `lat,lng` أو **رابط Google Maps** أو **Plus Code** (كاملاً أو مختصراً مع مدينة مرجعية) — فاكّ Open Location Code صحيح؛ أو اختر من الخريطة أو موقع هاتفك.
- **المسافة والوصول المتوقع**: مسافة الطريق عبر OSRM، وإلا فالمسافة الجوية × معامل؛ والـETA من سرعة الشاحنة الحية.
- **سائقون مرتبطون بالعملاء**: لا تُسند البوليصة إلا لسائق مرتبط بمرسلها (أو مفتوح للجميع) كما في الأصل، ويُفرض هذا أيضاً عند الإسناد الجماعي.
- **تتبع حي وسياج جغرافي**: الهاتف يبث موقعه؛ وبدخول نطاق الوجهة يُسجَّل الوصول تلقائياً ويُبلَّغ العميل والمنسّق.
- **إثبات التسليم**: اسم المستلم + توقيع *أو* صورة *أو* رمز التأكيد؛ وفشل التسليم يتطلب سبباً ويعود للتوزيع.
- **تحصيل COD**: السائق يحصّل نقداً والمحاسب يسوّيه سائقاً سائقاً.
- **التسعير**: تعرفة (أساس + كم + طبلية + كغ، مع حد أدنى) وتعرفة خاصة بالمسار؛ تُقترح الأخص وتُعاين قبل التحقق.
- **الفوترة**: فواتير مجمّعة لكل عميل، ضريبة، دفعات جزئية/كاملة، إلغاء مع الرجوع، كشف حساب وأعمار الديون.
- **صفحة تتبع عامة** وبوليصة مطبوعة مع QR.
- **تقارير** تُصدَّر CSV (يظهر العربي صحيحاً في Excel): *كشف الرحلات* و*حالة الشحنات* من الأصل، وأداء السائقين والإيرادات وأعمار الديون وكشف الحساب.
- **تطبيق سائق يعمل بدون إنترنت**: الخطوات المنفّذة بلا إشارة تُحفظ على الهاتف وتُرسل بالترتيب عند عودة الاتصال.
- **لوحة تحكم وتنبيهات**: مؤشرات، الالتزام بالموعد، المتأخرة، إيراد شهري، أكثر العملاء، حالة الأسطول، وانتهاء الرخص والتأمين والاستمارات.
- **سجل تدقيق**، إشعارات، مظهر فاتح/داكن، عربي RTL وإنجليزي LTR.

## التقنيات

| الطبقة | الاختيار |
|---|---|
| الواجهة | Next.js 16 (تصدير ثابت)، React 19، Tailwind CSS 4، Leaflet + OpenStreetMap، خط Tajawal |
| الجوال | Capacitor 6 (أندرويد) + إضافات الموقع والملفات والمشاركة |
| الخادم | Python 3.12 + FastAPI + SQLAlchemy 2 + Pydantic 2 |
| قاعدة البيانات | SQLite للتطوير، PostgreSQL للإنتاج |
| الأمان | JWT + bcrypt، والصلاحيات تُفحص في الخادم |

## التشغيل

المتطلبات: Node 20+ و Python 3.12.

**١) الخادم**
```bash
cd apps/api
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python scripts/seed_data.py             # شركة تجريبية و110+ بوليصة وفواتير وشاحنات على الطريق
.venv/Scripts/python -m uvicorn app.main:app --port 8020
```
التوثيق التفاعلي: <http://localhost:8020/docs>

**٢) الواجهة**
```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev                       # http://localhost:3020
```

**٣) أو بدون خادم**
```bash
npm run dev:local                 # http://localhost:3021 — كل النظام داخل المتصفح
```

### حسابات التجربة
صفحة الدخول تعرض بطاقة لكل دور؛ اضغطها فتدخل مباشرة.

| الدور | الدخول | كلمة المرور |
|---|---|---|
| مدير النظام | `admin@masar.local` | `admin1234` |
| منسّق | `dispatch@masar.app` | `demo1234` |
| محاسب | `finance@masar.app` | `demo1234` |
| عميل | `client@gulf.app` | `demo1234` |
| سائق | `driver1@masar.app` | `demo1234` |

> بيانات اختبار فقط. غيّر `ADMIN_PASSWORD` و`JWT_SECRET` قبل أي نشر حقيقي.

## بناء تطبيق أندرويد (APK)

يوجد APK جاهز في [`releases/masar-logistics-v1.0.apk`](releases/masar-logistics-v1.0.apk) (٦ ميغابايت، يعمل على المحرك المحلي بلا خادم؛ فعّل «التثبيت من مصادر غير معروفة»).

لبنائه بنفسك (JDK 17 من Android Studio + Android SDK):
```bash
cd apps/web
npm run build:local
npx cap sync android
python scripts/make-icons.py        # الأيقونات وشاشة البداية (أول مرة)
cd android
echo "sdk.dir=C\:/Users/<you>/AppData/Local/Android/Sdk" > local.properties
JAVA_HOME="<Android Studio>/jbr" ./gradlew assembleDebug
```
في وضع الخادم ضع في `NEXT_PUBLIC_API_URL` عنواناً عاماً **HTTPS** (وليس `localhost`) وأضف أصله إلى `CORS_ORIGINS`.

## الاختبارات
```bash
cd apps/api && .venv/Scripts/python -m pytest -q        # 31 اختباراً
```
تغطي دورة حياة البوليصة كاملة، قواعد الترقيم، الصلاحيات، عزل العملاء والشركات، صلاحية «عرض الكل»، تسوية COD، فشل التسليم، الوصول بالسياج الجغرافي، التتبع العام، فك Plus Code، اللوحات والتقارير. والمحرك المحلي يطابق الـAPI وتم فحصه بسيناريو من 22 خطوة.

## حدود معروفة (بصراحة)
- الـAPK موقَّع بمفتاح التطوير، وتم بناؤه وفحص محتواه لكن **لم يُجرَّب بعد على هاتف حقيقي**.
- الوضع المحلي يحفظ البيانات في المتصفح/الهاتف فقط؛ استخدم وضع الخادم للبيانات المشتركة.
- المسافات في الوضع المحلي تقديرية (بلا خدمة طرق).
- لم يُنفَّذ بعد: إشعارات الدفع، الفوترة الإلكترونية (ZATCA)، بوابة دفع، تعدد الفروع، WebSocket.

## الرخصة
MIT — انظر [LICENSE](LICENSE).

</div>
