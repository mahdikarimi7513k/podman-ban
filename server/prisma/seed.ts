import { eq, inArray } from "drizzle-orm"
import { db } from "../src/lib/db.js"
import { archiveFiles, books, institutions, modules, questions, remoteConfig, users } from "../src/lib/db/schema.js"

async function main() {
  console.log("🌱 Seeding podman-ban…")

  // ---- Remote config singleton ----
  await db
    .insert(remoteConfig)
    .values({
      id: "singleton",
      siteLocked: false,
      lockMessage: "",
      bannerText: "آزمون آزمایشی خرداد ماه فعال شد — موفق باشید!",
      bannerLink: "",
      bannerActive: true,
      defaultTimerMin: 20,
      negativeMarking: true,
    })
    .onConflictDoNothing()
    .run()

  // ---- Admin user (main) ----
  // Password comes from env when provided; otherwise a random one is generated
  // and logged ONCE at seed time. Existing users are never re-passworded by
  // re-seeding — rotate via the app or SEED_ADMIN_PASSWORD explicitly.
  const bcrypt = await import("bcryptjs")
  const randomPassword = () =>
    Array.from({ length: 16 }, () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789".charAt(
        Math.floor(Math.random() * 56),
      ),
    ).join("")

  let adminPassword = process.env.SEED_ADMIN_PASSWORD ?? ""
  const adminExisting = await db.select({ id: users.id }).from(users).where(eq(users.username, "hadi")).get()
  if (!adminExisting) {
    if (!adminPassword) {
      adminPassword = randomPassword()
      console.log(`✅ Admin bootstrap password (store it now): hadi / ${adminPassword}`)
    }
    const adminPass = await bcrypt.hash(adminPassword, 12)
    await db.insert(users).values({
      username: "hadi",
      name: "هادی",
      passwordHash: adminPass,
      field: "FANI_HERFEI",
      role: "ADMIN",
    }).run()
  }

  // ---- One regular student ----
  await db
    .insert(users)
    .values({
      username: "student",
      name: "هنرجوی نمونه",
      passwordHash: await bcrypt.hash("student1234", 12),
      field: "FANI_HERFEI",
      role: "STUDENT",
    })
    .onConflictDoNothing()
    .run()

  // ---- Content ----
  const seedBooks = [
    {
      title: "نصب و راه‌اندازی سیستم‌عامل و نرم‌افزار",
      field: "FANI_HERFEI" as const,
      order: 1,
      modules: [
        {
          title: "پودمان اول — مفاهیم پایه سیستم‌عامل",
          description: "آشنایی با ساختار سیستم‌عامل، فایل‌سیستم و فرآیند بوت.",
          order: 1,
          questions: [
            {
              text: "کدام یک از موارد زیر جزو وظایف هسته (Kernel) سیستم‌عامل است؟",
              options: [
                "مدیریت حافظه و زمان‌بندی پردازش",
                "نمایش تصویر روی مانیتور",
                "اجرای نرم‌افزارهای کاربردی",
                "ذخیره‌سازی فایل‌های شخصی",
              ],
              correctOption: 0,
              explanation: "هسته مسئول مدیریت منابع سخت‌افزاری از جمله حافظه و پردازش است.",
            },
            {
              text: "فایل‌سیستم NTFS بیشتر در کدام سیستم‌عامل به‌کار می‌رود؟",
              options: ["لینوکس", "ویندوز", "مک‌اواس", "اندروید"],
              correctOption: 1,
              explanation: "NTFS فایل‌سیستم پیش‌فرض ویندوز است.",
            },
            {
              text: "در فرآیند بوت، کدام مرحله نخست بارگذاری می‌شود؟",
              options: ["درایورها", "BOOT", "رابط گرافیکی", "برنامه‌های کاربردی"],
              correctOption: 1,
              explanation: "BOOT نخستین قطعه‌ای است که بایوس/UEFI بارگذاری می‌کند.",
            },
            {
              text: "پروسه (Process) در سیستم‌عامل چیست؟",
              options: [
                "یک فایل داده",
                "برنامه‌ای در حال اجرا",
                "نوعی حافظه نهان",
                "درایور سخت‌افزاری",
              ],
              correctOption: 1,
              explanation: "پروسه نمونه‌ای در حال اجرای یک برنامه است.",
            },
            {
              text: "حافظه مجازی (Virtual Memory) چه کمکی می‌کند؟",
              options: [
                "سرعت CPU را بالا می‌برد",
                "رم فیزیکی را با دیسک گسترش می‌دهد",
                "برق را ذخیره می‌کند",
                "فایل‌ها را فشرده می‌کند",
              ],
              correctOption: 1,
              explanation: "حافظه مجازی بخشی از دیسک را به‌عنوان رم استفاده می‌کند.",
            },
          ],
        },
        {
          title: "پودمان دوم — نصب ویندوز",
          description: "مراحل پارتیشن‌بندی، نصب و پیکربندی ویندوز.",
          order: 2,
          questions: [
            {
              text: "برای نصب ویندوز از کدام رسانه استفاده می‌شود؟",
              options: ["فلش بوت‌ساز", "فایل متنی", "تصویر", "فایل صوتی"],
              correctOption: 0,
              explanation: "فلش بوت‌ساز رایج‌ترین رسانه نصب است.",
            },
            {
              text: "حداقل رم برای نصب ویندوز ۱۰ چه‌قدر است؟",
              options: ["۱ گیگ", "۲ گیگ", "۴ گیگ", "۸ گیگ"],
              correctOption: 2,
              explanation: "ویندوز ۱۰ حداقل ۴ گیگ رم نیاز دارد.",
            },
            {
              text: "BIOS در کجا ذخیره می‌شود؟",
              options: ["روی هارد", "روی مادربرد", "روی رم", "روی CPU"],
              correctOption: 1,
              explanation: "BIOS روی چیپ مادربرد ذخیره می‌شود.",
            },
            {
              text: "پارتیشن سیستم در ویندوز معمولاً چه حرفی دارد؟",
              options: ["A", "B", "C", "D"],
              correctOption: 2,
              explanation: "درایو C پارتیشن پیش‌فرض سیستم است.",
            },
          ],
        },
        {
          title: "پودمان سوم — نصب نرم‌افزار و درایور",
          description: "نصب درایورها و نرم‌افزارهای کاربردی.",
          order: 3,
          questions: [
            {
              text: "درایور (Driver) چیست؟",
              options: [
                "یک ویروس",
                "نرم‌افزار ارتباط سیستم‌عامل و سخت‌افزار",
                "نوعی بازی",
                "فایل متنی",
              ],
              correctOption: 1,
              explanation: "درایور واسط سیستم‌عامل و سخت‌افزار است.",
            },
            {
              text: "بهترین منبع دریافت درایور کجاست؟",
              options: ["سایت سازنده", "نامشخص", "دوستان", "تبلیغ‌ها"],
              correctOption: 0,
              explanation: "همیشه از سایت رسمی سازنده دریافت کنید.",
            },
            {
              text: "Windows Update چه کار می‌کند؟",
              options: [
                "ویروس نصب می‌کند",
                "به‌روزرسانی‌های امنیتی و درایور را ارائه می‌دهد",
                "فایل‌ها را پاک می‌کند",
                "CPU را سریع‌تر می‌کند",
              ],
              correctOption: 1,
              explanation: "Windows Update آپدیت‌های رسمی مایکروسافت را نصب می‌کند.",
            },
          ],
        },
      ],
    },
    {
      title: "مدارها و الکتریسیته",
      field: "FANI_HERFEI" as const,
      order: 2,
      modules: [
        {
          title: "پودمان اول — مفاهیم پایه الکتریسیته",
          description: "ولتاژ، جریان، مقاومت و قانون اهم.",
          order: 1,
          questions: [
            {
              text: "واحد اندازه‌گیری جریان الکتریکی چیست؟",
              options: ["ولت", "آمپر", "اهم", "وات"],
              correctOption: 1,
              explanation: "جریان با آمپر سنجیده می‌شود.",
            },
            {
              text: "قانون اهم کدام است؟",
              options: ["V = I × R", "P = V × I", "V = P / I", "I = V × R"],
              correctOption: 0,
              explanation: "ولتاژ برابر حاصل‌ضرب جریان در مقاومت است.",
            },
            {
              text: "واحد مقاومت الکتریکی چیست؟",
              options: ["وات", "ولت", "اهم", "فاراد"],
              correctOption: 2,
              explanation: "مقاومت با اهم اندازه‌گیری می‌شود.",
            },
            {
              text: "ترانزیستور عمدتاً چه نقشی دارد؟",
              options: ["ذخیره انرژی", "تقویت یا کلیدزنی سیگنال", "نمایش زمان", "تولید نور"],
              correctOption: 1,
              explanation: "ترانزیستور برای تقویت یا سوئیچینگ به‌کار می‌رود.",
            },
          ],
        },
      ],
    },
    {
      title: "شبکه‌های کامپیوتری",
      field: "FANI_HERFEI" as const,
      order: 3,
      modules: [
        {
          title: "پودمان اول — مفاهیم پایه شبکه",
          description: "آشنایی با شبکه، مدل OSI و پروتکل‌ها.",
          order: 1,
          questions: [
            {
              text: "در مدل OSI، لایه‌ی انتقال (Transport) کدام است؟",
              options: ["لایه ۱", "لایه ۲", "لایه ۴", "لایه ۷"],
              correctOption: 2,
              explanation: "لایه‌ی انتقال لایه‌ی چهارم مدل OSI است.",
            },
            {
              text: "پروتکل HTTP روی کدام پورت پیش‌فرض کار می‌کند؟",
              options: ["۲۱", "۲۵", "۸۰", "۴۴۳"],
              correctOption: 2,
              explanation: "HTTP پیش‌فرض روی پورت ۸۰ است.",
            },
            {
              text: "آدرس IP نسخه ۴ چند بیت است؟",
              options: ["۱۶ بیت", "۳۲ بیت", "۶۴ بیت", "۱۲۸ بیت"],
              correctOption: 1,
              explanation: "IPv4 آدرس‌های ۳۲ بیتی استفاده می‌کند.",
            },
            {
              text: "دستگاهی که شبکه‌های محلی را به هم وصل می‌کند چه نام دارد؟",
              options: ["هاب", "سوییچ", "روتر", "مودم"],
              correctOption: 2,
              explanation: "روتر شبکه‌های مختلف را به هم وصل می‌کند.",
            },
            {
              text: "DNS چه وظیفه‌ای دارد؟",
              options: ["ارسال ایمیل", "ترجمه‌ی نام دامنه به IP", "ذخیره‌ی فایل", "مدیریت رم"],
              correctOption: 1,
              explanation: "DNS نام دامنه را به آدرس IP ترجمه می‌کند.",
            },
            {
              text: "کدام یک یک آدرس IP خصوصی است؟",
              options: ["8.8.8.8", "192.168.1.1", "4.2.2.4", "1.1.1.1"],
              correctOption: 1,
              explanation: "192.168.x.x یکی از محدوده‌های IP خصوصی است.",
            },
          ],
        },
        {
          title: "پودمان دوم — امنیت شبکه",
          description: "فایروال، رمزنگاری و امنیت سایبری.",
          order: 2,
          questions: [
            {
              text: "فایروال (Firewall) چه وظیفه‌ای دارد؟",
              options: ["افزایش سرعت شبکه", "فیلتر کردن ترافیک شبکه", "ذخیره‌ی داده", "نمایش وب"],
              correctOption: 1,
              explanation: "فایروال ترافیک ورودی و خروجی را فیلتر می‌کند.",
            },
            {
              text: "HTTPS از کدام پورت استفاده می‌کند؟",
              options: ["۸۰", "۴۴۳", "۲۱", "۲۲"],
              correctOption: 1,
              explanation: "HTTPS روی پورت ۴۴۳ با رمزنگاری TLS کار می‌کند.",
            },
            {
              text: "رمزنگاری متقارن چه ویژگی‌ای دارد؟",
              options: ["دو کلید متفاوت", "یک کلید مشترک", "بدون کلید", "سه کلید"],
              correctOption: 1,
              explanation: "در رمزنگاری متقارن از یک کلید مشترک استفاده می‌شود.",
            },
            {
              text: "حمله‌ی phishing چیست؟",
              options: ["خراب‌کردن سخت‌افزار", "فریب کاربر برای سرقت اطلاعات", "آلوده‌کردن فایل", "قطع شبکه"],
              correctOption: 1,
              explanation: "phishing با فریب کاربر اطلاعات او را می‌دزدد.",
            },
          ],
        },
      ],
    },
    {
      title: "مبانی حسابداری",
      field: "KARDANESH" as const,
      order: 1,
      modules: [
        {
          title: "پودمان اول — مفاهیم پایه حسابداری",
          description: "دارایی، بدهی، سرمایه و معادله حسابداری.",
          order: 1,
          questions: [
            {
              text: "معادله اساسی حسابداری کدام است؟",
              options: ["دارایی = بدهی + سرمایه", "دارایی = درآمد - هزینه", "سرمایه = دارایی - درآمد", "بدهی = دارایی + سرمایه"],
              correctOption: 0,
              explanation: "دارایی برابر جمع بدهی و سرمایه است.",
            },
            {
              text: "صورت مالی «ترازنامه» چه چیزی را نشان می‌دهد؟",
              options: ["درآمد و هزینه یک دوره", "وضعیت مالی در یک لحظه", "جریان نقدی", "سود و زیان"],
              correctOption: 1,
              explanation: "ترازنامه وضعیت مالی در یک تاریخ مشخص را نشان می‌دهد.",
            },
            {
              text: "«بدهکار» در حسابداری به چه معناست؟",
              options: ["کاهش حساب", "افزایش دارایی یا کاهش بدهی", "ثبت سود", "بستن حساب"],
              correctOption: 1,
              explanation: "بدهکار طرف دارایی را افزایش یا بدهی را کاهش می‌دهد.",
            },
          ],
        },
        {
          title: "پودمان دوم — دفتر روزنامه و کل",
          description: "ثبت اسناد حسابداری.",
          order: 2,
          questions: [
            {
              text: "دفتر روزنامه برای چه استفاده می‌شود؟",
              options: ["ثبت تراکنش‌ها به ترتیب زمانی", "ذخیره فاکتور", "محاسبه مالیات", "چاپ صورتحساب"],
              correctOption: 0,
              explanation: "تراکنش‌ها به‌ترتیب وقوع در روزنامه ثبت می‌شوند.",
            },
            {
              text: "دفتر کل چه تفاوتی با روزنامه دارد؟",
              options: [
                "تراکنش‌ها به تفکیک حساب جمع می‌شود",
                "هیچ تفاوتی ندارد",
                "فقط درآمد را نشان می‌دهد",
                "فقط بدهی را نشان می‌دهد",
              ],
              correctOption: 0,
              explanation: "دفتر کل تراکنش‌ها را به تفکیک هر حساب جمع‌بندی می‌کند.",
            },
          ],
        },
      ],
    },
    {
      title: "طراحی صفحات وب",
      field: "KARDANESH" as const,
      order: 2,
      modules: [
        {
          title: "پودمان اول — HTML و ساختار صفحات",
          description: "تگ‌های HTML، ساختار سند و معناشناسی.",
          order: 1,
          questions: [
            {
              text: "کدام تگ عنوان صفحه را مشخص می‌کند؟",
              options: ["<header>", "<title>", "<head>", "<meta>"],
              correctOption: 1,
              explanation: "تگ <title> عنوان صفحه را در تب مرورگر نمایش می‌دهد.",
            },
            {
              text: "تگ <a> برای چه چیزی استفاده می‌شود؟",
              options: ["تصویر", "لینک", "پاراگراف", "لیست"],
              correctOption: 1,
              explanation: "تگ <a> یک هایپرلینک ایجاد می‌کند.",
            },
            {
              text: "کدام تگ یک لیست بدون ترتیب ایجاد می‌کند؟",
              options: ["<ol>", "<ul>", "<li>", "<dl>"],
              correctOption: 1,
              explanation: "<ul> یک لیست بدون ترتیب (bullet) ایجاد می‌کند.",
            },
            {
              text: "ویژگی alt در تگ img چه کاربردی دارد؟",
              options: ["تغییر اندازه", "توضیح تصویر برای دسترسی‌پذیری", "لینک دادن", "استایل دادن"],
              correctOption: 1,
              explanation: "alt متن جایگزین تصویر برای صفحه‌خوان‌ها است.",
            },
            {
              text: "کدام یک یک تگ معنایی (semantic) در HTML5 است؟",
              options: ["<div>", "<span>", "<article>", "<b>"],
              correctOption: 2,
              explanation: "<article> یک تگ معنایی برای محتوای مستقل است.",
            },
          ],
        },
        {
          title: "پودمان دوم — CSS و استایل‌دهی",
          description: "انتخابگرها، رنگ، چیدمان و فلکس‌باکس.",
          order: 2,
          questions: [
            {
              text: "کدام خاصیت برای تغییر رنگ متن استفاده می‌شود؟",
              options: ["background", "color", "font", "text"],
              correctOption: 1,
              explanation: "color رنگ متن را تعیین می‌کند.",
            },
            {
              text: "display: flex چه امکاناتی فراهم می‌کند؟",
              options: ["چیدمان جدولی", "چیدمان انعطاف‌پذیر", "نمایش.none", "تغییر فونت"],
              correctOption: 1,
              explanation: "flex یک چیدمان انعطاف‌پذیر یک‌بعدی فراهم می‌کند.",
            },
            {
              text: "واحد rem به چه چیزی اشاره دارد؟",
              options: ["پیکسل ثابت", "نسبت به فونت ریشه", "نسبت به والد", "درصد صفحه"],
              correctOption: 1,
              explanation: "rem نسبت به سایز فونت عنصر ریشه (html) است.",
            },
            {
              text: "کدام خاصیت فاصله‌ی داخل عنصر را تنظیم می‌کند؟",
              options: ["margin", "padding", "border", "outline"],
              correctOption: 1,
              explanation: "padding فاصله‌ی داخل عنصر تا محتوای آن است.",
            },
          ],
        },
      ],
    },
  ]

  for (const b of seedBooks) {
    const book = await db
      .insert(books)
      .values({
        title: b.title,
        field: b.field,
        order: b.order,
      })
      .returning({ id: books.id })
      .get()
    if (!book) throw new Error("seed: book insert failed")
    for (const m of b.modules) {
      const mod = await db
        .insert(modules)
        .values({
          bookId: book.id,
          title: m.title,
          description: m.description,
          order: m.order,
        })
        .returning({ id: modules.id })
        .get()
      if (!mod) throw new Error("seed: module insert failed")
      await db
        .insert(questions)
        .values(
          m.questions.map((q) => ({
            moduleId: mod.id,
            text: q.text,
            options: JSON.stringify(q.options),
            correctOption: q.correctOption,
            explanation: q.explanation,
          })),
        )
        .run()
    }
  }

  // ---- Institutions ----
  const inst1 = await db.insert(institutions).values({ name: "قلمچی", order: 1 }).returning({ id: institutions.id }).get()
  const inst2 = await db.insert(institutions).values({ name: "تیک کلاس", order: 2 }).returning({ id: institutions.id }).get()
  if (!inst1 || !inst2) throw new Error("seed: institution insert failed")

  // ---- Archive files ----
  await db
    .insert(archiveFiles)
    .values([
      {
        title: "آزمون نهایی پودمان نصب سیستم‌عامل — خرداد ۱۴۰۳",
        field: "FANI_HERFEI",
        year: 1403,
        month: 4,
        fileUrl: "#",
        answerUrl: "#",
        institutionId: inst1.id,
      },
      {
        title: "آزمون نهایی الکتریسیته — اردیبهشت ۱۴۰۳",
        field: "FANI_HERFEI",
        year: 1403,
        month: 2,
        fileUrl: "#",
        answerUrl: "#",
        institutionId: inst1.id,
      },
      {
        title: "آزمون نهایی حسابداری — تیر ۱۴۰۲",
        field: "KARDANESH",
        year: 1402,
        month: 4,
        fileUrl: "#",
        institutionId: inst2.id,
      },
    ])
    .run()

  // ---- Clean up old demo accounts ----
  await db.delete(users).where(inArray(users.username, ["admin", "kardanesh"])).run()

  console.log(`✅ Seeded. Admin username: hadi (password set at first creation via SEED_ADMIN_PASSWORD or the logged bootstrap value)`)
  console.log(`✅ Student → username: student / pass: student1234`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
