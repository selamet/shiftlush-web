# ShiftLush — Tasarım Girdisi

> Bu dosya, tasarım fazında Claude'a verilecek **tek ek dosyadır**. Teknik şartnameden
> (`shiftlush-api/faz1-sartname.md`) yalnızca tasarımı ilgilendiren kısımlar damıtıldı.
> Şartnamenin tamamı verilmez — 1750 satırın büyük kısmı Django modeli, migration stratejisi
> ve KVKK uyumu; tasarımcı için gürültü.
>
> Şartname değişirse bu dosya da güncellenmelidir.

---

## 1. Ürün

Türkiye'de faaliyet gösteren **asansör bakım firmaları** için müşteri, bina, asansör ve
sözleşme kayıt sistemi. Faz 1 kapsamı: kayıt tutma ve QR etiketleme. Bakım planı, bakım
formu, arıza takibi ve faturalama Faz 2'de gelecek — bu ekranlar **şimdi tasarlanmaz.**

Tek bir firmada beklenen hacim: 50+ müşteri, 100+ bina, **500+ asansör**, 60+ sözleşme.

Arayüz dili **Türkçe**, istisnasız. Marka adı "ShiftLush" İngilizce kalır.

---

## 2. Kullanıcılar

| Rol | Türkçe etiket | Bağlam | Ne yapar |
|---|---|---|---|
| `owner` | Firma sahibi | Masaüstü + telefon, günde birkaç kez | Her şey + firma ayarları + kullanıcı pasifleştirme |
| `admin` | Yönetici | Masaüstü, gün içinde sık | Firma ayarları hariç her şey, kullanıcı davet eder |
| `operations` | Operasyon | **Masaüstü, günde 6-8 saat** | Müşteri/bina/asansör/sözleşme kaydı. Asıl kullanıcı |
| `technician` | Teknisyen | Faz 1 masaüstü, **Faz 2 sahada telefon** | Sadece kendisine atanmış müşterilerin kayıtlarını görür. Yazma yetkisi yok |
| `accountant` | Muhasebe | Masaüstü, haftalık | Sözleşmelerin mali bilgileri. Asansörün teknik künyesini **görmez** |

**Tasarımın merkezinde `operations` var.** Gün boyu veri girişi yapıyor; hız ve hata
yapmama estetikten önce gelir.

**Teknisyenin Faz 2 bağlamı bugünden hesaba katılmalı:** sahada, telefonla, tek elle, çoğu
zaman eldivenli, loş makine dairesinde, zayıf bağlantıda.

### Yetki matrisi

| Kaynak / İşlem | owner | admin | operations | technician | accountant |
|---|:---:|:---:|:---:|:---:|:---:|
| Firma ayarları — okuma | ✓ | ✓ | ✓ | ✓ | ✓ |
| Firma ayarları — yazma | ✓ | – | – | – | – |
| Kullanıcı listeleme | ✓ | ✓ | – | – | – |
| Kullanıcı davet/düzenleme | ✓ | ✓ | – | – | – |
| Kullanıcı pasifleştirme | ✓ | – | – | – | – |
| Müşteri — okuma | ✓ | ✓ | ✓ | kısıtlı¹ | ✓ |
| Müşteri — yazma | ✓ | ✓ | ✓ | – | – |
| Bina / Site — okuma | ✓ | ✓ | ✓ | kısıtlı¹ | – |
| Bina / Site — yazma | ✓ | ✓ | ✓ | – | – |
| Asansör — okuma | ✓ | ✓ | ✓ | kısıtlı¹ | – |
| Asansör — yazma | ✓ | ✓ | ✓ | – | – |
| Sözleşme — okuma | ✓ | ✓ | ✓ | – | ✓ |
| Sözleşme — yazma | ✓ | ✓ | ✓ | – | – |
| **Sözleşme mali alanları** | ✓ | ✓ | **–** | – | ✓ |
| QR etiket üretimi | ✓ | ✓ | ✓ | ✓ | – |
| Denetim kayıtları | ✓ | ✓ | – | – | – |

¹ Teknisyen yalnızca kendisine atanmış müşterilerin kayıtlarını görür. Ataması yoksa
**boş liste** görür — bu bir hata değil, normal bir durumdur ve boş durum ekranı bunu
doğru anlatmalıdır.

**Tasarım sonucu:** Kenar çubuğu menüsü role göre değişir. Ayrıca aynı ekranda bazı
alanlar role göre gizlenir — özellikle sözleşme detayında `operations` mali alanları
görmez, `accountant` teknik künyeyi görmez. Gizlenen alanın yerinde ne olacağına karar
verilmeli.

---

## 3. Veri hiyerarşisi

```
Firma (tenant)
└── Müşteri            ← sözleşme ve fatura buna bağlanır
    ├── Müşteri iletişim kişisi (birden fazla, biri "birincil")
    ├── Site           ← opsiyonel gruplama; tek apartmanlarda yok
    │   └── Bina
    │       └── Asansör
    └── Bina           ← siteye bağlı olmayan bina doğrudan müşteriye bağlanır
        └── Asansör

Sözleşme (müşteriye bağlı)
└── Sözleşme–asansör ilişkisi (birim fiyatlı)
```

**Kritik ilişki kuralları — arayüz bunları anlatabilmeli:**

- Müşteri, binadan **ayrı** bir varlıktır. Bir site yönetimi 8 binanın müşterisi olabilir.
- Sözleşme **müşteriye** bağlanır, binaya değil.
- Bir asansör aynı anda **yalnızca bir aktif sözleşmede** olabilir.
- Sözleşme feshedildiğinde asansör ilişkisi silinmez, kapatılır — geçmiş korunur.
- Zincir kuralı: müşteri yoksa bina eklenemez, bina yoksa asansör eklenemez. Boş durum
  ekranları bu zinciri anlatmalıdır.

---

## 4. Ekran envanteri

Faz 1'de tasarlanacak ekranların tamamı. Bunun dışında ekran icat edilmez.

**Giriş duvarı öncesi**
1. Giriş
2. Kayıt (firma + firma sahibi hesabı birlikte açılır)
3. Davet kabul — çalışan linke tıklar, **kendi şifresini belirler**
4. Şifre sıfırlama isteği
5. Şifre sıfırlama onayı (yeni şifre belirleme)
6. E-posta doğrulama sonucu

**Uygulama**
7. Uygulama kabuğu — kenar çubuğu (rol bazlı), üst bar, breadcrumb, kullanıcı menüsü
8. Müşteriler — liste
9. Müşteri — detay (iletişim kişileri, binaları, sözleşmeleri)
10. Müşteri — ekle / düzenle formu
11. Siteler — liste
12. Site — detay + ekle / düzenle formu
13. Binalar — liste
14. Bina — detay (asansörleri) + ekle / düzenle formu
15. **Asansörler — liste** (en yoğun ekran)
16. **Asansör — detay** (künye + ekler + sözleşme + QR + değişiklik geçmişi)
17. **Asansör — ekle / düzenle formu** (sekmeli, 30+ alan)
18. Sözleşmeler — liste
19. **Sözleşme — detay** (rol bazlı alan gizleme)
20. Sözleşme — ekle / düzenle formu
21. Sözleşme — asansör ekleme/çıkarma
22. Sözleşme — fesih ve yenileme akışları
23. Kullanıcılar — liste + davet
24. Teknisyen müşteri ataması
25. Ayarlar — firma bilgileri
26. Ayarlar — kendi profilim
27. Denetim kayıtları — liste (filtreli)
28. **QR etiket yazdırma** — seçim, önizleme, A4 çıktı
29. QR yönlendirme — `/q/{token}` okutulduğunda gelinen ara sayfa

**Kalın yazılanlar kilit ekranlardır** — diğerlerinin şablonunu bunlar belirler.

---

## 5. Ekranda görünen alanlar ve Türkçe etiketleri

Bu bölüm tasarımın asıl girdisidir. Etiketler burada sabitlenmiştir; tasarımda başka bir
Türkçe karşılık uydurulmaz. Etiketler doğrudan `messages/tr.json` dosyasına geçecektir.

### 5.1 Asansör — 30+ alan, sekmeli forma bölünür

**Sekme: Kimlik**

| Alan | Türkçe etiket | Tip | Not |
|---|---|---|---|
| `building` | Bina | seçim | Zorunlu |
| `registration_number` | Asansör kimlik no | metin | Firma içinde benzersiz |
| `internal_code` | Firma iç kodu | metin | |
| `name` | Asansör adı | metin | "Sol asansör", "Yük asansörü" |
| `status` | Durum | seçim | Aşağıdaki enum |
| `maintenance_interval_days` | Bakım periyodu (gün) | sayı | 1–30, varsayılan 30 |

**Sekme: Sınıflandırma**

| Alan | Türkçe etiket | Tip |
|---|---|---|
| `category` | Kategori | seçim |
| `drive_type` | Tahrik tipi | seçim |
| `control_type` | Kumanda tipi | seçim |
| `door_type` | Kapı tipi | seçim |
| `has_car_door` | Kabin kapısı var | anahtar |
| `machine_room` | Makine dairesi | seçim |

> `has_car_door = false` **periyodik kontrolde ağır uygunsuzluk sebebidir.** Bu alanın
> arayüzde dikkat çekmesi ve raporlanabilir olması gerekir.

**Sekme: Teknik**

| Alan | Türkçe etiket | Tip |
|---|---|---|
| `capacity_kg` | Taşıma kapasitesi (kg) | sayı |
| `capacity_persons` | Kapasite (kişi) | sayı |
| `stop_count` | Durak sayısı | sayı, 2–100 |
| `entrance_count` | Giriş sayısı | sayı |
| `speed_mps` | Beyan hızı (m/s) | ondalık |
| `pit_depth_mm` | Kuyu dibi derinliği (mm) | sayı |
| `headroom_mm` | Son kat yüksekliği (mm) | sayı |
| `car_weight_kg` | Kabin ağırlığı (kg) | sayı |

**Sekme: Üretim ve montaj**

| Alan | Türkçe etiket | Tip |
|---|---|---|
| `brand` | Marka | metin |
| `model` | Model | metin |
| `serial_number` | Seri no | metin |
| `manufacturer` | Üretici firma | metin |
| `installer` | Montajcı firma | metin |
| `installation_date` | Montaj tarihi | tarih, gelecek olamaz |
| `commissioning_date` | İlk kullanım tarihi | tarih |
| `ce_certificate_number` | CE belge no | metin |
| `warranty_end_date` | Garanti bitiş tarihi | tarih |

**Sekme: Periyodik kontrol**

| Alan | Türkçe etiket | Tip |
|---|---|---|
| `last_inspection_date` | Son kontrol tarihi | tarih |
| `inspection_label` | Etiket rengi | seçim |
| `next_inspection_date` | Sonraki kontrol tarihi | tarih |
| `inspection_body` | Muayene kuruluşu | metin |
| `inspection_report_number` | Kontrol rapor no | metin |

**Sekme: Ekler** — fotoğraf, CE belgesi, uygunluk beyanı, ruhsat.

**Ayrıca:** `notes` → "Notlar" (uzun metin), `qr_token` → "QR kodu" (üretilir, düzenlenmez).

> **Alanların çoğu opsiyoneldir.** Saha ekibi asansörü yarım künyeyle açar; bu normal bir
> durumdur, hata değil. "Eksik ama geçerli" hali görsel olarak hatadan ayrılmalıdır.

### 5.2 Müşteri

| Alan | Türkçe etiket |
|---|---|
| `type` | Müşteri tipi |
| `legal_name` | Ticari unvan |
| `tax_office` | Vergi dairesi |
| `tax_number` | Vergi numarası |
| `national_id` | TC kimlik no *(sadece şahıs müşteride)* |
| `phone` | Telefon |
| `email` | E-posta |
| adres alanları | Fatura adresi (bkz. 5.7) |
| `notes` | Notlar |
| `is_active` | Aktif |

### 5.3 Müşteri iletişim kişisi

| Alan | Türkçe etiket |
|---|---|
| `full_name` | Ad soyad |
| `role` | Görev |
| `phone` | Telefon |
| `email` | E-posta |
| `is_primary` | Birincil iletişim kişisi *(müşteri başına en fazla bir tane)* |
| `notes` | Notlar |

### 5.4 Bina

| Alan | Türkçe etiket | Not |
|---|---|---|
| `customer` | Müşteri | Zorunlu |
| `complex` | Site | Opsiyonel |
| `name` | Bina adı | "A Blok", "Yıldız Apartmanı" |
| `type` | Bina tipi | |
| adres alanları | Adres | Bkz. 5.7 |
| `address_note` | Adres tarifi | **Zorunlu serbest metin** — yeni siteler ve TOKİ bölgeleri adres veri setinde yoktur |
| `floor_count` | Kat sayısı | |
| `unit_count` | Daire / ofis sayısı | |
| `is_active` | Aktif | |

### 5.5 Site

`name` → Site adı, `customer` → Müşteri, adres alanları, `notes` → Notlar.

### 5.6 Sözleşme

| Alan | Türkçe etiket | Mali¹ |
|---|---|:---:|
| `contract_number` | Sözleşme no | |
| `customer` | Müşteri | |
| `status` | Durum | |
| `scope` | Kapsam | |
| `start_date` | Başlangıç tarihi | |
| `end_date` | Bitiş tarihi | |
| `pricing_type` | Fiyatlandırma tipi | ✓ |
| `monthly_fee` | Aylık ücret | ✓ |
| `currency` | Para birimi | ✓ |
| `vat_rate` | KDV oranı (%) | ✓ |
| `billing_period` | Fatura dönemi | ✓ |
| `auto_renew` | Otomatik yenilensin | |
| `renewal_notice_days` | Yenileme bildirim süresi (gün) | |
| `previous_contract` | Önceki sözleşme | |
| `terminated_at` | Fesih tarihi | |
| `termination_reason` | Fesih gerekçesi | |
| `signed_document` | İmzalı sözleşme | |
| `notes` | Notlar | |

¹ Mali işaretli alanları `operations` ve `technician` **görmez**.

Sözleşme–asansör ilişkisinde ayrıca: `unit_price` → "Birim fiyat" (mali), `added_at` →
"Eklenme tarihi", `removed_at` → "Çıkarılma tarihi".

### 5.7 Adres alanları — her varlıkta aynı

| Alan | Türkçe etiket | Davranış |
|---|---|---|
| `province` | İl | 81 kayıt, tam liste açılır menü |
| `district` | İlçe | İl seçilince yüklenir |
| `neighborhood` | Mahalle | **Typeahead** — en az 2 karakter, en fazla 20 sonuç. Tam liste asla basılmaz |
| `street` | Sokak / cadde | |
| `building_number` | Dış kapı no | |
| `unit_number` | İç kapı no | |
| `latitude` / `longitude` | Konum | Harita üzerinden, **zorunlu değil** |

Mahalle listesinde köy ve belde de var; `type` alanı ayırır.

### 5.8 Kullanıcı

`first_name` → Ad, `last_name` → Soyad, `email` → E-posta, `phone` → Telefon,
`role` → Rol, `is_active` → Aktif, `last_login_at` → Son giriş,
`certificate_number` → Mesleki yeterlilik belge no, `certificate_valid_until` → Belge geçerlilik tarihi.

> `certificate_valid_until` yaklaşan/geçmiş ise arayüzde uyarı gösterilir.

### 5.9 Firma ayarları

`legal_name` → Ticari unvan, `display_name` → Görünen ad, `tax_office` → Vergi dairesi,
`tax_number` → Vergi numarası, `mersis_number` → MERSİS no,
`trade_registry_number` → Ticaret sicil no, adres alanları, `phone` → Telefon,
`email` → E-posta, `website` → Web sitesi, `logo` → Logo.

---

## 6. Enum değerleri ve Türkçe karşılıkları

Backend İngilizce kod döndürür, arayüz Türkçe gösterir. **Rozet ve durum çipi tasarımının
girdisi budur.**

**Asansör durumu** (`status`)
`active` Aktif · `suspended` Askıya alınmış · `sealed` Mühürlü · `out_of_service` Hizmet dışı · `uncontracted` Sözleşmesiz

> `uncontracted` kullanıcı tarafından seçilemez, sistem atar.

**Asansör kategorisi** (`category`)
`passenger` İnsan asansörü · `freight` Yük asansörü · `passenger_freight` İnsan-yük asansörü · `dumbwaiter` Servis asansörü · `accessibility_platform` Engelli platformu · `vehicle` Araç asansörü

**Tahrik tipi** (`drive_type`)
`geared_electric` Dişlili elektrikli · `gearless_electric` Dişlisiz elektrikli · `hydraulic` Hidrolik

**Kumanda tipi** (`control_type`)
`simple_collective` Basit toplamalı · `down_collective` Aşağı toplamalı · `full_collective` Tam toplamalı · `group_control` Grup kumandalı

**Kapı tipi** (`door_type`)
`automatic_center` Otomatik merkezi · `automatic_side` Otomatik yandan · `semi_automatic` Yarı otomatik · `manual` Manuel

**Makine dairesi** (`machine_room`)
`present` Var · `absent` Yok · `partial` Kısmi

**Periyodik kontrol etiketi** (`inspection_label`)
`green` Yeşil · `blue` Mavi · `yellow` Sarı · `red` Kırmızı · `none` Etiketsiz

> **Tasarımın çözmesi gereken asıl problem burada.** Bu bir VERİ alanıdır, sistem durumu
> değil. Sistem renkleri (başarı/bilgi/uyarı/hata) de aynı dört rengi ister ve ikisi aynı
> tabloda yan yana görünür. Ayrı bir görsel dille ayrıştırılmalı; ayrıca renk tek başına
> bilgi taşımamalı, metin etiketi de bulunmalı.

**Sözleşme durumu** (`status`)
`draft` Taslak · `active` Aktif · `expired` Süresi dolmuş · `terminated` Feshedilmiş · `renewed` Yenilenmiş

**Sözleşme kapsamı** (`scope`)
`maintenance_only` Sadece bakım · `maintenance_and_repair` Bakım ve onarım · `full_coverage` Tam kapsam

**Fiyatlandırma tipi** (`pricing_type`)
`per_elevator` Asansör başına · `flat` Sabit ücret

**Fatura dönemi** (`billing_period`)
`monthly` Aylık · `quarterly` 3 aylık · `semiannual` 6 aylık · `annual` Yıllık

**Müşteri tipi** (`type`)
`complex_management` Site yönetimi · `building_management` Bina yönetimi · `corporate` Kurumsal · `public` Kamu · `individual` Şahıs

**İletişim kişisi görevi** (`role`)
`manager` Yönetici · `auditor` Denetçi · `caretaker` Görevli / kapıcı · `technical_lead` Teknik sorumlu · `accounting` Muhasebe · `other` Diğer

**Bina tipi** (`type`)
`residential` Konut · `commercial` Ticari · `mixed_use` Karma kullanım · `public` Kamu · `hospital` Hastane · `mall` AVM · `hotel` Otel · `school` Okul · `industrial` Sanayi

**Kullanıcı rolü** (`role`)
`owner` Firma sahibi · `admin` Yönetici · `operations` Operasyon · `technician` Teknisyen · `accountant` Muhasebe

**Ek kategorisi** (`category`)
`photo` Fotoğraf · `ce_certificate` CE belgesi · `declaration_of_conformity` Uygunluk beyanı · `permit` Ruhsat · `signed_contract` İmzalı sözleşme · `inspection_report` Kontrol raporu · `logo` Logo · `other` Diğer

**Mahalle tipi** (`type`)
`neighborhood` Mahalle · `village` Köy · `town` Belde

### Bilinmeyen enum değeri kuralı

Backend ileride yeni bir değer ekleyebilir (örneğin yeni bir asansör kategorisi). Arayüz
karşılığını bulamadığında **çökmez ve boş göstermez** — ham değeri gösterir. Bunun görsel
hali tasarlanmalıdır ki kullanıcı "bozuk" sanmasın.

---

## 7. Hata durumları

Backend Türkçe metin döndürmez, makine okunabilir kod döndürür; çeviriyi arayüz yapar.
Tasarlanacak hata metinleri:

| Kod | Türkçe karşılık | Nerede görünür |
|---|---|---|
| `VALIDATION_ERROR` | Girdiğiniz bilgilerde hata var | Form üstü blok |
| `INVALID_TAX_NUMBER` | Vergi numarası geçersiz | Alan altı |
| `INVALID_NATIONAL_ID` | TC kimlik numarası geçersiz | Alan altı |
| `END_DATE_BEFORE_START_DATE` | Bitiş tarihi başlangıç tarihinden önce olamaz | Alan altı |
| `DUPLICATE_REGISTRATION_NUMBER` | Bu asansör kimlik numarası zaten kayıtlı | Alan altı |
| `EMAIL_ALREADY_REGISTERED` | Bu e-posta adresi zaten kayıtlı | Alan altı |
| `RECORD_IN_USE` | Bu kayıt kullanımda olduğu için silinemez | Onay diyaloğu / toast |
| `ELEVATOR_ALREADY_CONTRACTED` | Bu asansör zaten aktif bir sözleşmede | İş kuralı bloğu |
| `IDEMPOTENCY_KEY_REUSED` | İşlem tekrarlandı | Nadir, teknik |

**Tasarlanması gereken diğer haller:**

- **409 çakışma** — "asansörü olan bina silinemez". Kullanıcıya sadece hatayı değil,
  **ne yapması gerektiğini** de söylemeli.
- **403 yetkisiz** — menüde gizliyse buraya nasıl düştü? Doğrudan URL ile. Ekran gerekli.
- **404 / başka firmanın kaydı** — ikisi de aynı ekranı gösterir.
- **500** — yanıt gövdesinde `request_id` var, kullanıcı destek ekibine bunu okuyacak.
  **Kolay kopyalanır** biçimde gösterilmeli.
- **Ağ yok / sunucuya ulaşılamıyor.**
- **Oturum süresi doldu** — kullanıcı formu yarım doldurmuşken olabilir. Veri kaybolmamalı.

---

## 8. Özel akışlar ve davranışlar

### 8.1 Uygulama açılışı

Erişim jetonu güvenlik gereği **bellekte** tutulur, tarayıcı depolamasına yazılmaz. Sonuç:
her sayfa yenilemesinde oturum arka planda tazelenir (~300 ms). Bu süre için bir **uygulama
iskeleti** gerekir; boş beyaz ekran veya tam sayfa spinner kabul edilmez.

### 8.2 Adres seçici — sistemin en karmaşık bileşeni

İl → ilçe → mahalle typeahead → sokak / kapı no → adres tarifi → harita.

Harita **iki yönlü** çalışır:
1. Adres seçilince harita oraya gider, kullanıcı pini sürükler.
2. Pin bırakılınca adres alanları otomatik dolar — ama bu bir **öneridir**, kilitlenmez,
   kullanıcı düzeltebilir.

Tasarlanması gereken zor durumlar:
- **Mahalle bulunamadı** → akış tıkanmamalı, "adres tarifi" alanına yönlendirmeli.
- **Harita önerdi ama emin değil** → yanlış mahalleyi otomatik doldurmak, boş bırakmaktan
  kötüdür. Emin olunmayan öneri belirgin olmalı.
- **Konum hiç girilmedi** → zorunlu değil, ama uyarı görünmeli.
- **Mobilde** harita ile form aynı ekrana sığmaz.

### 8.3 QR etiket

- Ekranda: seçilen asansörlerin listesi → önizleme → yazdır. Toplu seçim bina veya müşteri
  bazlı olabilir ("bu binanın tüm asansörlerinin etiketini yazdır").
- Çıktı: **A4'te 3×4 = 12 etiket**, PDF.
- Her etikette: QR, asansör adı, bina adı, asansör kimlik no, firma logosu ve telefonu —
  hepsi Türkçe.
- QR minimum **25×25 mm**, hata düzeltme seviyesi H.
- Etiket **makine dairesinde, loş ışıkta, kirli ve yıpranmış yüzeyde** okunacak: yüksek
  kontrast, kalın tipografi, ince çizgi yok.
- QR yenilendiğinde **eski etiketler geçersizleşir** — arayüz bunu açıkça söylemeli.

### 8.4 Geri alınamaz aksiyonlar

Farklı ağırlıkta, aynı onay diyaloğu hepsine kullanılmaz — kademelenmeli:

| Aksiyon | Ağırlık |
|---|---|
| Kayıt silme | Orta — geri alınabilir gibi görünür ama arayüzde geri alma yok |
| Sözleşme feshi | Ağır — mali sonucu var, asansör ilişkileri kapanır |
| Kullanıcı pasifleştirme | Ağır — kişi erişimini kaybeder |
| QR token yenileme | Ağır — basılı etiketler çöp olur |

### 8.5 Davet akışı

Yönetici e-posta + ad + rol girer. Çalışan e-postadaki linke tıklar ve **kendi şifresini
belirler**. Yönetici şifre belirlemez, şifre hiçbir yerde gösterilmez. Davet 72 saat
geçerli; süresi dolan davet yeniden gönderilebilir.

---

## 9. Liste ekranları

**Kural: liste verisi tablodur, kart ızgarası değildir.** İstisnasız. Mobilde de karta
dönüştürülmez — başka bir çözüm bulunmalı.

- Sunucu tarafı sayfalama. **Sonsuz kaydırma yok**, sayfa numarası var.
- Varsayılan sayfa boyutu 25, en fazla 100.
- Sayaç biçimi: "1-25 / 342 kayıt".
- Filtre, sayfalama ve sıralama durumu **URL'de taşınır** — paylaşılabilir ve geri tuşuyla
  gezilebilir olmalı. Aktif filtreler çip olarak görünür ve tek tek kaldırılabilir.
- "Filtre sonucu boş" ile "hiç kayıt yok" **farklı** görünmeli.

**Asansör listesi** en yoğun ekran: 500+ satır, 30+ alan. Tabloya hepsi sığmaz; hangi 7-8
kolonun görüneceğine karar verilmeli. Filtreler: durum, bina, müşteri, etiket rengi,
kategori, arama. Toplu seçim + "seçilenlerin QR etiketini yazdır".

---

## 10. Örnek veri

Tasarımda **gerçekçi Türk asansör sektörü verisi** kullanılmalı. Lorem ipsum, "Örnek Metin",
"Building 1" gibi doldurma kullanılmaz — sahte veri, tasarımın yoğunluk kararlarını yanıltır.

**Firma:** Yükseliş Asansör Bakım ve Servis Ltd. Şti. *(görünen ad: Yükseliş Asansör)*

**Müşteriler:** Çamlıca Konakları Site Yönetimi · Nurtepe Sitesi Yönetimi ·
Ataşehir Ofis Kule A.Ş. · Bahçelievler Belediyesi · Yıldız Apartmanı Yönetimi

**Binalar:** Çamlıca Konakları A Blok · Çamlıca Konakları B Blok · Yıldız Apartmanı ·
Ofis Kule 1 · Nurtepe Sitesi C Blok

**Mahalleler:** Barbaros Mah. (Ataşehir/İstanbul) · Küçükbakkalköy Mah. (Ataşehir) ·
Fenerbahçe Mah. (Kadıköy) · Merkez Mah. (Kağıthane) · Cumhuriyet Mah. (Bahçelievler)

**Markalar:** Schindler · Otis · Kone · ThyssenKrupp · Merih Asansör · Akış Asansör

**Kişiler:** Mehmet Yılmaz · Ayşe Demir · Hakan Çelik · Zeynep Kaya · Emre Şahin

**Asansör adları:** Sol asansör · Sağ asansör · Yük asansörü · A1 · Servis asansörü

**Sözleşme numarası:** `2026-0043` *(otomatik üretilir: yıl + sıra)*

**Asansör kimlik no:** `34-2019-004512` gibi bir biçim varsayılabilir — **resmî biçim henüz
doğrulanmadı**, tasarımda yalnızca uzunluk ve okunabilirlik için örnek olarak kullanılsın.

**Tutarlar:** Aylık ücret `4.750,00 ₺` · Birim fiyat `1.250,00 ₺` · KDV `%20`
*(ondalık ayracı virgül, binlik ayracı nokta — `Intl.NumberFormat("tr-TR")`)*

**Tarihler:** `21.08.2026` biçiminde *(`Intl.DateTimeFormat("tr-TR")`)*

---

## 11. Teknik kısıtlar

- **Vite + React 19 + TypeScript + TailwindCSS + shadcn/ui** ile birebir uygulanacak.
  Sunucu tarafı render yok, tamamen istemci tarafı SPA. shadcn/ui'de karşılığı olmayan
  bileşen icat edilmez.
- İkon seti **lucide-react**. Başka set yok, emoji ikon yok.
- **Açık ve koyu tema**, ikisi de tam. Ofis kullanıcısı gün boyu açık temada, teknisyen
  loş makine dairesinde.
- **Mobil öncelikli düşünülür** — Faz 2'de teknisyen bu ekranları telefonda kullanacak.
- Arayüzdeki her metin Türkçe. **Türkçe metinler İngilizce karşılıklarından ortalama %20
  uzundur** — buton, etiket ve kolon genişlikleri en uzun Türkçe metne göre boyutlandırılır.
  Örnek: "Kalıcı olarak sil", "Sözleşmeyi feshet", "Periyodik kontrol raporu numarası",
  "Birincil iletişim kişisi".
- Erişilebilirlik: renk tek başına bilgi taşımaz; odak halkası belirgin; dokunma alanı
  teknisyen eldivenle kullanacak kadar büyük.

## 12. Kaçınılacaklar

- Mor-mavi gradyan, cam efekti, gereksiz animasyon, dekoratif illüstrasyon
- Liste verisi için kart ızgarası
- Sonsuz kaydırma
- Uzun formu modal içine koymak
- Sadece renge dayalı durum gösterimi
- Faz 1 kapsamı dışında ekran icat etmek (bakım planı, arıza, fatura, müşteri portalı)
- İngilizce arayüz metni
