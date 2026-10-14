# IndexFlow — تجهيز Chrome Web Store

الملفات دي هي كل حاجة محتاجها عشان ترفع الإضافة على متجر Chrome: النصوص، الإجابات على أسئلة الخصوصية، شرح الصلاحيات، والصور.
المتطلبات مأخوذة من وثائق Chrome للمطوّرين (صور المتجر، سياسة الخصوصية، قسم Privacy practices).

## 1. الملفات الجاهزة

| الملف | الاستخدام |
|---|---|
| `screenshots/screenshot-1.png` … `screenshot-4.png` | لقطات المتجر 1280×800 (مطلوب 1 على الأقل، والأفضل حتى 5) |
| `screenshots/promo-small-440x280.png` | الصورة الترويجية الصغيرة (مطلوبة) |
| `src/` | مصادر HTML للقطات، لو عايز تعدل النص عليها |
| `../index-flow/` | مجلد الإضافة نفسه (يتضغط منه ملف الرفع) |
| `../docs/` | الموقع: الصفحة الرئيسية، سياسة الخصوصية، سياسة الاستخدام (عربي وإنجليزي) |

ملف الرفع (ZIP) متعمل من مجلد `index-flow` بدون ملفات التوثيق، وموجود في مساحة العمل خارج المستودع باسم `IndexFlow-1.10.0-store.zip`.
**ما ترفعش** ملف `index-flow - Muhammed v14.zip` الموجود في جذر المستودع، لأنه نسخة قديمة.

## 2. قبل ما ترفع: خطوات لازم تتعمل

1. **فعّل GitHub Pages**: Settings → Pages → Source: *Deploy from a branch* → Branch: `main` (أو الفرع اللي هيتدمج فيه التغييرات) → Folder: `/docs`. الموقع هيبقى على:
   - https://muhammedyasserbs.github.io/index-now/ (الرئيسية عربي)
   - https://muhammedyasserbs.github.io/index-now/en/ (الرئيسية إنجليزي)
   - https://muhammedyasserbs.github.io/index-now/privacy/ (سياسة الخصوصية عربي)
   - https://muhammedyasserbs.github.io/index-now/en/privacy/ (سياسة الخصوصية إنجليزي) ← **ده الرابط اللي تحطه في المتجر**
   - https://muhammedyasserbs.github.io/index-now/terms/ و `/en/terms/` (سياسة الاستخدام)
2. **تأكد إن الروابط دي شغالة** من متصفح من غير تسجيل دخول. Google بتراجع الصفحة وممنوع تكون محجوبة.
3. **المسار في `manifest.json`** (`homepage_url`) مبني على الرابط اللي فوق. لو غيّرت الدومين، غيّره هنا كمان.
4. **بريد التواصل**: تم ✅ `muhammedyasserbs@gmail.com` في الموقع (كل الصفحات) وفي سياسة الخصوصية والشروط. وده هو الإيميل اللي هتستخدمه في Support URL / Support email في المتجر.
5. **الرابط الفعلي للمتجر**: بعد ما الإضافة تتنشر، حط رابطها في `docs/assets/site.js` في المتغير `STORE_URL`، وكل زراير «أضفها إلى Chrome» هتتوجه له تلقائياً.

## 3. حساب المطوّر

- سجّل على [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) بحساب Google. فيه رسوم تسجيل مرة واحدة (راجعها وقت التسجيل من الصفحة الرسمية).
- هتحتاج تأكيد الهوية. الاسم اللي هيظهر في المتجر هو الاسم اللي هتسجل بيه الحساب.

## 4. النصوص في المتجر

### الاسم
`IndexFlow`

### الملخص (Summary) — إنجليزي (125 حرف، الحد 132)
> Queue Search Console indexing requests from sitemaps or URL lists. Removes duplicates, sets pacing. Runs locally, no account.

### الملخص — عربي (115 حرف)
> طابور فهرسة جماعي لروابط Search Console من خريطة الموقع أو قائمة روابط، مع استبعاد المكرر والتحكم في الفاصل الزمني.

> ملاحظة: الملخص في الـ manifest هو اللي بيظهر في المتجر كـ«وصف قصير». الوصف المختصر في `manifest.json` حالياً عربي، فلو عايز الإنجليزي يظهر على المتجر الإنجليزي، ترجمة الملخص تتضاف في قائمة Localized listing من الداشبورد.

### الوصف التفصيلي — إنجليزي (مقترح)
> IndexFlow helps you request indexing for many pages in Google Search Console, one queue at a time.
>
> Load a sitemap (XML, sitemap indexes and gzip files), paste a list of URLs, or upload a TXT, CSV or JSON file. IndexFlow reads the URLs, removes duplicates, skips pages that were already requested, and adds the rest to the queue.
>
> What it does:
> • Three indexing modes: New only, Re-index, or Both.
> • A configurable delay between requests (10 seconds by default).
> • Automatic retry for failed URLs, and a final round for deferred ones.
> • When Google's daily quota is reached, the queue stops and affected URLs stay reserved until the quota resets.
> • Live counters, search and filters, a full activity log, and CSV export.
> • Safe stop: if the Search Console tab closes or freezes, the queue stops and the log explains why.
>
> Privacy: no account, no tracking, and no data sent to the developer. Settings and the queue stay in your browser. Full policy: https://muhammedyasserbs.github.io/index-now/en/privacy/
>
> Requirements: Chrome 116 or newer, and a Google account signed in to Search Console with access to the site.
>
> IndexFlow is an independent tool and is not affiliated with Google. Google Search Console is a trademark of Google LLC. IndexFlow cannot guarantee that Google will index any page.

### الوصف التفصيلي — عربي (مقترح)
> IndexFlow تساعدك على طلب فهرسة عدد كبير من صفحات موقعك في Google Search Console، من خلال طابور منظم.
>
> حمّل خريطة الموقع (XML وفهارس الخرائط وملفات gzip)، أو الصق قائمة روابط، أو ارفع ملف TXT أو CSV أو JSON. تقرأ IndexFlow الروابط، وتستبعد المكرر، وتتجاوز ما طُلب سابقاً، ثم تضيف الباقي إلى الطابور.
>
> المميزات:
> • ثلاثة أوضاع: الجديدة فقط، أو إعادة الفهرسة، أو الاثنان معاً.
> • فاصل زمني قابل للضبط بين الطلبات (10 ثوانٍ افتراضياً).
> • إعادة محاولة تلقائية للروابط الفاشلة، وجولة أخيرة للروابط المؤجلة.
> • عند بلوغ حصة Google اليومية يتوقف الطابور، وتبقى الروابط المتأثرة محجوزة حتى تتجدد الحصة.
> • إحصائيات مباشرة، وبحث وفلاتر، وسجل نشاط كامل، وتصدير CSV.
> • توقف آمن: إذا أُغلق تبويب Search Console أو تجمد، يتوقف الطابور ويوضح السجل السبب.
>
> الخصوصية: لا حسابات ولا تتبع، ولا تُرسل أي بيانات إلى المطوّر. الإعدادات والطابور محفوظة في متصفحك. السياسة الكاملة: https://muhammedyasserbs.github.io/index-now/privacy/
>
> المتطلبات: Chrome 116 أو أحدث، وحساب Google مسجل الدخول إلى Search Console وله صلاحية على الموقع.
>
> IndexFlow أداة مستقلة وغير تابعة لـ Google. Google Search Console علامة تجارية لشركة Google LLC. لا تضمن الإضافة فهرسة أي صفحة من Google.

### الفئة واللغة
- **الفئة**: Productivity (الإنتاجية).
- **اللغة الافتراضية**: مقترح الإنجليزي كلغة أساسية، والعربي كترجمة (Localized listing). الواجهة نفسها عربية، فالصور بالعربي مناسبة للاتنين.
- **الروابط**: Homepage = `https://muhammedyasserbs.github.io/index-now/`، Support = نفس الرابط أو بريد الدعم.

## 5. الصور المرفوعة في المتجر

- **Icon 128×128**: موجودة في الـ ZIP (`icons/icon-128x128.png`).
- **Screenshots (1280×800)**: `screenshots/screenshot-1.png` إلى `screenshot-4.png`. الترتيب المقترح: 4، 1، 2، 3.
- **Small promo tile 440×280**: `screenshots/promo-small-440x280.png`.
- **Marquee 1400×560**: اختياري، مش مطلوب. لو عايزه يتعمل بنفس الهوية.
- **YouTube video**: الداشبورد بيعرضه في قسم الصور وقت التعبئة (تأكد لو لازم قبل الرفع). لو مش عندك فيديو، حاول تعمل فيديو قصير 60 ثانية (فتح الإضافة، تحميل خريطة، بدء الطابور) وارفعه على YouTube كـ Unlisted.

## 6. أسئلة Privacy practices في الداشبورد

### Single purpose (الغرض الواحد)
> IndexFlow sends bulk indexing requests for URLs the user manages in Google Search Console, from a sitemap or URL list the user provides, and tracks the queue.

### Remote code
**لا** — الإضافة لا تنفذ أي كود بعيد. كل الكود موجود داخل الـ ZIP.

### Data usage (نوع البيانات)
الإضافة لا ترسل أي بيانات خارج الجهاز، لذلك الأوضح إنك **ما تختارش** أي فئة من فئات البيانات المجمعة. وتأكد من الشهادات الثلاث:
- ✅ عدم بيع أو نقل بيانات المستخدم لأطراف ثالثة (خارج حالات الاستخدام المسموحة). صياغة الشهادات الدقيقة اقرأها في الداشبورد وقت التعبئة.
- ✅ عدم استخدام البيانات لأغراض لا علاقة لها بالغرض الواحد للإضافة.
- ✅ عدم استخدام البيانات لتحديد الجدارة الائتمانية أو لأغراض الإقراض.

> لو أضفت لاحقاً أي تحليلات أو إرسال بيانات لسيرفر، لازم تحدّث الإجابات دي وسياسة الخصوصية.

### Permission justifications (تبرير الصلاحيات)

| الصلاحية | التبرير (إنجليزي، جاهز للنسخ) |
|---|---|
| `sidePanel` | Shows the IndexFlow panel, where the user loads sitemaps or URLs and monitors the indexing queue. |
| `storage` | Saves the user's settings, URL queue, per-URL status and activity log locally, so work resumes after the browser restarts. Nothing is sent to a server. |
| `tabs` | Finds the open Google Search Console tab, reads its URL to confirm it is the right page, and opens one when the user starts a queue. |
| `scripting` | Injects the extension's content script into the Search Console tab when the queue runs, so it can read each URL's indexing status and submit the request. |
| `alarms` | A periodic watchdog that stops the queue safely if the Search Console tab closes or freezes. |
| `notifications` | Notifies the user when the queue finishes or when Google's daily quota is reached. |
| Host permissions `http://*/*`, `https://*/*` | The user enters a sitemap URL on any website. The extension fetches that sitemap and the child sitemaps it lists, to build the URL list. Requests are sent without cookies (credentials omitted). Access is needed because the sitemap location is chosen by the user. |
| Content scripts on `search.google.com/search-console/*` | Runs only on Google Search Console pages, to read indexing status and submit indexing requests on the user's behalf. |

> ملاحظة: صلاحية `unlimitedStorage` اتشالت قبل كده، ومفيش صلاحيات زيادة في الـ manifest.

## 7. سياسة الخصوصية (ملخص ما تقوله الصفحة)

الصفحة متاحة بالعربي والإنجليزي، وبتغطي:
- البيانات المحفوظة محلياً فقط (الإعدادات، الطابور، سجل الروابط المطلوبة، سجل النشاط، بيانات الحصة) ومفيش إرسال لأي سيرفر للمطوّر.
- شرح كل صلاحية وسبب استخدامها.
- خط Cairo: اللوحة الجانبية بتحمله من Google Fonts، وده مذكور صراحةً في الصفحة لأن Google ممكن تستقبل IP المستخدم.
- حذف البيانات، والتعديلات، والتواصل.

## 8. نقاط محتاجة انتباهك قبل الرفع

- **مخاطرة مراجعة / شروط Google**: الإضافة بتأتمت واجهة Search Console (تفتح الصفحات وتضغط «طلب الفهرسة»). حسب علمي، Google Search Console ماعندهاش API عام لطلب فهرسة صفحات عادية، وشروط خدماتها بتمنع الوصول الآلي غير المصرح به (راجعها بنفسك). المراجعة ممكن تسأل عن ده، وممكن تطلب توضيح، فالأفضل تراجع الشروط دي بنفسك قبل ما تنشر إضافة للعامة.
- **صلاحية الـ host الواسعة** (`http://*/*` و`https://*/*`): مطلوبة لأن الـ sitemap بيتحدد من المستخدم، لكن هتخليها تبان مبررة في الوصف والصفحات، وده اللي عملناه.
- **الاسم والوصف**: الإضافة مش تابعة لـ Google، والتنويه ده موجود في الصفحات والوصف. ما تستخدمش كلمة Google في الاسم.
- **التحديث**: كل مرة ترفع نسخة جديدة لازم ترفع الرقم في `manifest.json` (الحالي 1.10.0).

## 9. Checklist قبل ما تضغط Submit

- [x] GitHub Pages شغال، وصفحة الخصوصية متاحة من غير تسجيل دخول.
- [ ] `homepage_url` في `manifest.json` بيفتح الموقع.
- [ ] ملف ZIP متضغط من `index-flow` (مش من المستودع كله، ومش فيه ملفات `.md`).
- [ ] Icon 128، 4 screenshots (1280×800)، Small promo (440×280) مرفوعين.
- [ ] Single purpose + تبرير كل صلاحية + Remote code = No.
- [ ] إجابات Data usage والشهادات الثلاث.
- [ ] Privacy policy URL = صفحة الإنجليزي أو العربي.
- [x] بريد التواصل: muhammedyasserbs@gmail.com (موجود في الموقع والسياسات). حطه في حقل Support email في المتجر.
- [ ] الوصف الإنجليزي والعربي والملخصين (≤132 حرف).
- [ ] Category = Productivity، اللغة الافتراضية = English، ومعاها Arabic localization.
- [ ] بعد الموافقة: حط رابط المتجر في `docs/assets/site.js` (`STORE_URL`).

## 10. الكلمات المفتاحية (من اقتراحات Google الفعلية)

الأرقام دي مش حجم بحث. اقتراحات Google Autocomplete بتقول **الناس بتكتب إيه**، وظهور الاقتراح مؤشر قوي على الطلب. لو عايز أرقام حجم بحث حقيقية استخدم Google Keyword Planner (مجاني مع حساب Google Ads) أو Google Trends.

ملحوظة عن الدولة: الـ endpoint العام ما بيفرقش كويس بين مصر والسعودية والإمارات للاستعلامات العربية، والنتايج متطابقة تقريباً. لو عايز تفصيل دقيق لكل دولة، الأسهل تشغّل SerpAPI (`engine=google_autocomplete` مع `gl=eg` و`gl=sa`) بمفتاحك.

### عربي (مصر والخليج)
| الاستعلام | ملاحظة | الاستخدام المقترح |
|---|---|---|
| سيرش كونسول | الأكثر اقتراحاً، والاسم الدارج | عنوان الصفحة والوصف |
| سيرش كونسول فهرسة | نية واضحة لحل المشكلة | وصف الإضافة (العربي) |
| فهرسة الموقع في جوجل | بحث عام عن الفهرسة | الهيرو والوصف |
| افهرسة الصفحات في جوجل | ظهر في السعودية | عنوان قسم المميزات |
| طلب فهرسة | مصر والسعودية | الوصف وصفحة التثبيت |
| اضافة فهرسة | مصر والسعودية | الوصف |
| ازاي افهرس صفحة | سؤال مصري شائع | FAQ (موجود) |
| جوجل لا يفهرس موقعي | مشكلة شائعة | FAQ (موجود) |
| جوجل لا يفهرس | نسخة مختصرة | FAQ |

### إنجليزي
| الاستعلام | ملاحظة | الاستخدام المقترح |
|---|---|---|
| google search console extension / chrome extension | استعلام الإضافة نفسه | عنوان الصفحة والملخص |
| request indexing google search console | الأعلى نية | الهيرو والوصف الإنجليزي |
| bulk indexing google | بحث عن «جماعي» | الوصف الإنجليزي |
| google indexing chrome extension | قريب من الاستعلام الرئيسي | الوصف |
| google index checker chrome extension | بحث عن أداة مشابهة | المميزات |
| how to speed up / improve google indexing | سؤال تعليمي | محتوى مدونة لاحقاً |
| how long does google indexing take | سؤال شائع | FAQ (موجود) |
| google search console api request indexing | سوء فهم شائع | FAQ (موجود، بيوضح إن مفيش API رسمي) |
| google search console request indexing not working | مشكلة شائعة | FAQ |

### ملاحظات
- **استخدم الكلمات بشكل طبيعي** في العناوين والنصوص. ما تحشيش الكلمات، لأن Chrome Web Store بيعاقب على keyword spam.
- **ما تستخدمش Google في اسم الإضافة**. ولو ذكرت Google Search Console في الوصف، الإخلاء موجود في الصفحات.
- **Google مابتقراش meta keywords**، فالفايدة الحقيقية من العناوين والـ FAQ والوصف.
- **بعد ما الموقع يشتغل**، راقب استعلامات الموقع نفسه في Search Console (تبويب Performance) وعدّل الصفحات على الاستعلامات اللي فعلاً بتجيب زيارات.
