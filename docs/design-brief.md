# Tasarım Fazı — Claude'a Verilecek Prompt

> Bu dosya bir dokümantasyon değil, **kopyalanıp Claude'a yapıştırılacak prompt metnidir.**
> Şartname (`faz1-sartname.md`) dosyasını eke koy, sonra aşağıdaki blokları **sırayla** gönder.
> Tek seferde hepsini gönderme — üç aşamanın her biri ayrı bir artifact üretecek kadar büyük.

---

## Sabitlenen kararlar

- **Ürün adı: ShiftLush.** Depo adları (`shiftlush-api`, `shiftlush-web`) ve arayüzdeki
  marka adı bununla hizalı. Şartnamedeki `elevator-api` / `elevator-web` referansları
  düzeltildi.
- **Sistem renkleri ile periyodik kontrol etiketi renkleri ayrışacak.** Asansör etiketi
  `yeşil / mavi / sarı / kırmızı` olabiliyor ve bu **veri**, durum değil. Sistem de
  başarı=yeşil, uyarı=sarı, hata=kırmızı kullanırsa kullanıcı "kırmızı etiketli asansör" ile
  "hatalı kayıt" arasını ayıramaz. Aşama 1'de bunun çözülmesi açıkça isteniyor.
- **Açık ve koyu tema, ikisi de tam.** Ofis kullanıcısı gün boyu açık temada; teknisyen
  Faz 2'de loş makine dairesinde telefonla. Token seti baştan iki temalı kurulmalı.

### Marka üzerine not

"ShiftLush" İngilizce ve soyut bir ad; ürün ise Türkçe arayüzlü, ciddi bir endüstriyel
B2B aracı. Tasarımın bu boşluğu kapatması gerekiyor: marka adı İngilizce kalabilir ama
görsel dil asansör/bakım/güvenlik sektörüne ait okunmalı. Adın çağrıştırdığı yumuşak,
tüketici ürünü estetiğine kaymasın.

---

## AŞAMA 1 — Tasarım sistemi

```
Ekteki dosya, bir asansör bakım takip sisteminin Faz 1 teknik şartnamesi. Tamamını oku.
Özellikle bölüm 5 (veri modeli), bölüm 6 (roller), bölüm 10 (Türkçe arayüz), bölüm 13
(frontend yapısı) ve bölüm 20 (tasarım fazına devir notları) bu işin girdisi.

Senden bu sistemin GÖRSEL TASARIM SİSTEMİNİ kurmanı istiyorum. Ekran çizmeyeceksin;
sonraki aşamalarda çizilecek ~25 ekranın tamamının üzerine oturacağı temeli kuracaksın.

## Ürün ve kullanıcı bağlamı

Ürün adı: ShiftLush
Kullanıcı: Türkiye'de faaliyet gösteren asansör bakım firmaları.
Tek bir firmada 50+ müşteri, 100+ bina, 500+ asansör, 60+ sözleşme kaydı olacak.

Beş rol var, üçü farklı bağlamda çalışıyor:
- Operasyon personeli — masaüstü, günde 6-8 saat, klavye ağırlıklı yoğun veri girişi.
  Bu ürünün asıl kullanıcısı. Hız ve hata yapmama her şeyden önemli.
- Firma sahibi / yönetici — masaüstü ve telefon, günde birkaç kez, özet ve onay bakar.
- Teknisyen — Faz 1'de salt okuma, Faz 2'de sahada telefonla asıl kullanıcı olacak:
  tek elle, çoğu zaman eldivenli, loş makine dairesinde, zayıf bağlantıda.
- Muhasebe — sözleşme mali bilgilerini görür, asansörün teknik künyesini GÖRMEZ.

Bu bir SaaS pazarlama sitesi değil, günde saatlerce bakılan bir iş aracı. "Etkileyici"
değil "yorulmadan taranabilir" olmalı. Ama 2010'ların kurumsal gri panelini de istemiyorum.

## Marka

"ShiftLush" İngilizce ve soyut bir ad, ürün ise Türkçe arayüzlü ciddi bir endüstriyel
B2B aracı. Marka adı İngilizce kalıyor ama görsel dil asansör / bakım / güvenlik sektörüne
ait okunmalı. Adın çağrıştırabileceği yumuşak, tüketici ürünü estetiğine kayma.
Sektör çağrışımı: dikey hareket, hassasiyet, mühendislik, güvenlik, süreklilik.
Bana bir logo işareti (wordmark + sembol) ve markanın tek cümlelik görsel tanımını da ver.

## Pazarlık dışı teknik kısıtlar

- Vite + React 19 + TypeScript + TailwindCSS + shadcn/ui ile birebir uygulanacak. Sunucu
  tarafı render yok, tamamen istemci tarafı bir SPA. shadcn/ui'de
  karşılığı olmayan bileşen icat etme; her tasarım kararı bir Tailwind sınıfına ve bir
  shadcn bileşenine karşılık gelmeli.
- İkon seti: lucide-react. Başka set kullanma, emoji ikon kullanma.
- Arayüzdeki HER metin Türkçe. Tek bir İngilizce kelime bile bırakma.
- Türkçe metinler İngilizce karşılıklarından ortalama %20 daha uzun. Buton, etiket ve
  kolon genişliklerini en uzun Türkçe metne göre boyutlandır; kırpma/taşma olmasın.
  Örnek gerçek metinler: "Kalıcı olarak sil", "Sözleşmeyi feshet", "Asansör kimlik no",
  "Periyodik kontrol raporu numarası", "Bakım periyodu (gün)".
- Açık ve koyu tema, ikisi de tam. Token seti CSS değişkenleriyle kurulmalı.

## Çözmeni istediğim asıl problem

Periyodik kontrol etiketi rengi bir VERİ alanı: yeşil / mavi / sarı / kırmızı / etiketsiz.
Sistem durum renkleri de aynı dört rengi kullanmak isteyecek (başarı / bilgi / uyarı / hata).
Bu ikisi aynı ekranda yan yana görünüyor. Kullanıcının "kırmızı etiketli asansör" ile
"hatalı satır" arasını ayırt edebilmesi gerekiyor.

Bunu ayrı bir görsel dil kurarak çöz — farklı doygunluk, farklı form (dolu daire / çerçeveli
rozet), farklı yerleşim, ne yaparsan yap. Ve erişilebilirlik gereği renk TEK BAŞINA bilgi
taşımasın: her etiketin yanında metin karşılığı da olsun. Kararını gerekçesiyle yaz.

## Üreteceğin çıktı

Tek bir kendi kendine yeten HTML artifact. Tailwind CDN kullan. Sayfa, tasarım sisteminin
canlı dokümantasyonu olsun — her bileşeni gerçek Türkçe içerikle ve gerçek örnek veriyle
göster. Lorem ipsum, "Örnek Metin", "Building 1" gibi doldurma kullanma; gerçekçi Türk
asansör sektörü verisi kullan (Schindler / Otis / Kone / Merih marka adları, "Yıldız Sitesi
A Blok" gibi bina adları, İstanbul mahalle adları, "2026-0043" gibi sözleşme numaraları).

Sayfada sırayla şunlar olsun:

1. Renk sistemi — açık ve koyu tema yan yana. Yüzey katmanları, metin hiyerarşisi, kenarlık,
   birincil aksiyon rengi, sistem durum renkleri, VE ayrıca etiket rengi paleti (yukarıdaki
   problemin çözümü). Her renk için CSS değişken adı ve WCAG kontrast oranı yaz.
2. Tipografi ölçeği — font ailesi seçimi (Türkçe karakterleri düzgün render eden bir aile
   seç ve neden seçtiğini yaz), boyut/ağırlık/satır yüksekliği skalası, tablo içi rakamların
   hizalanması için tabular-nums kullanımı.
3. Boşluk ve ölçü skalası, köşe yarıçapı, gölge katmanları, kenarlık kalınlıkları.
4. Bileşen anatomileri — her biri tüm durumlarıyla (varsayılan / üzerinde / odakta / dolu /
   hatalı / devre dışı / salt okunur):
   - Buton varyantları (birincil, ikincil, tehlikeli, hayalet, ikon-buton)
   - Form alanı: metin, sayı, para (₺ ve binlik ayracı), tarih, seçim kutusu, çoklu seçim,
     arama-ile-seçim (typeahead), anahtar, onay kutusu, metin alanı
   - Alan hatası gösterimi ve form üstü genel hata bloğu
   - Rozet / durum çipi varyantları (asansör durumu, sözleşme durumu, etiket rengi, rol)
   - Tablo satırı, başlık, sıralama göstergesi, seçim kutucuğu, satır sonu aksiyon menüsü
   - Sayfalama kontrolü (sunucu tarafı — "1-25 / 342 kayıt" biçiminde)
   - Filtre çubuğu ve aktif filtre çipleri
   - Sekme, breadcrumb, açılır menü, onay diyaloğu, yan panel (sheet), bildirim (toast)
   - Boş durum bloğu, yükleniyor iskeleti, hata durumu bloğu
5. Yoğunluk kararı — 500 satırlık tabloda satır yüksekliği ne olmalı? Kararını ekranda
   üç farklı yoğunlukta örnek tablo göstererek gerekçelendir.
6. Erişilebilirlik notları — odak halkası tasarımı, minimum dokunma alanı (teknisyen
   eldivenle kullanacak), kontrast eşikleri.

## Yapmayacakların

- Mor-mavi gradyan, cam efekti (glassmorphism), gereksiz animasyon, dekoratif illüstrasyon —
  bunlar bu üründe yer tutuyor ve tarama hızını düşürüyor.
- Liste verisi için kart ızgarası. Bu ürünün listeleri tablodur, istisnasız.
- Karşılığı olmayan bileşen icat etmek.
- İngilizce arayüz metni.

Kararlarını kısa gerekçelerle yaz. Emin olmadığın yerde iki seçenek üret ve bana sor.
```

---

## AŞAMA 2 — Kilit ekranlar

> Aşama 1'in çıktısı onaylandıktan sonra gönder.

```
Tasarım sistemi onaylandı. Şimdi kilit ekranları çiz.

25 ekranın hepsini çizmeyeceğiz. Aşağıdaki 8 ekran, kalan hepsinin şablonunu belirliyor —
bunlar doğru olursa gerisi mekanik olarak türetilir.

Her ekranı Aşama 1'deki token ve bileşenleri kullanarak, gerçek Türkçe içerik ve gerçekçi
örnek veriyle çiz. Her ekran için hem masaüstü hem mobil kırılımı göster.

1. GİRİŞ EKRANI
   E-posta + şifre. Yanına: kayıt ol, şifremi unuttum. Marka varlığının tek güçlü göründüğü
   yer burası. Hatalı giriş durumu ve "5 denemeden sonra 15 dakika kilit" durumu da olsun.

2. UYGULAMA KABUĞU (app shell)
   Kenar çubuğu + üst bar + içerik alanı. Kenar çubuğu menüsü ROLE GÖRE değişiyor —
   beş rolün gördüğü menüyü ayrı ayrı göster (şartname bölüm 6.2 yetki matrisi).
   Mobilde kenar çubuğu çekmece olur.
   Kritik detay: erişim jetonu bellekte tutuluyor, sayfa her yenilendiğinde oturum
   arka planda tazeleniyor. Bu ~300ms'lik açılış durumu için bir uygulama iskeleti tasarla —
   boş beyaz ekran veya tam sayfa spinner istemiyorum.

3. LİSTE ŞABLONU — Asansörler
   Bu ürünün en yoğun ekranı, 500+ satır. Sunucu tarafı sayfalama, sonsuz kaydırma YOK.
   İçermesi gerekenler: arama, filtre çubuğu (durum, bina, müşteri, etiket rengi, kategori),
   sıralanabilir kolonlar, çoklu seçim + "seçilenlerin QR etiketini yazdır" toplu aksiyonu,
   satır sonu aksiyon menüsü, sayfalama.
   Kolon seçimi senin kararın — 30+ alan var, tabloya hepsi sığmaz. Hangi 7-8 kolonun
   görüneceğine karar ver ve gerekçelendir.
   Mobilde tablo nasıl davranacak? Bunu çöz — kart ızgarasına DÖNÜŞTÜRME, başka bir yol bul.

4. UZUN FORM ŞABLONU — Asansör ekle / düzenle
   30+ alan var ve tek uzun form kullanılabilir değil. Sekmeli veya adımlı bir yapı kur:
   Kimlik / Sınıflandırma / Teknik / Üretim ve Montaj / Periyodik Kontrol / Ekler.
   Çözmen gerekenler: hangi sekmede kaç zorunlu alan eksik kaldığı nasıl görünecek,
   kaydetme bir sekmede mi tüm formda mı, yarım bırakılan form ne oluyor, sekmeler arası
   geçişte doğrulama ne zaman çalışıyor.
   Not: şartname zorunlu alan sayısını abartmamayı söylüyor — saha ekibi eksik bilgiyle
   kayıt açmak zorunda. Yani "eksik ama geçerli" kayıt normal bir durum, hata değil.
   Bunu görsel olarak nasıl anlatacağını göster.

5. DETAY ŞABLONU — Asansör detayı
   Künye bilgileri + bağlı olduğu bina/müşteri + aktif sözleşme + ekler (fotoğraf, CE belgesi)
   + QR kodu ve etiket yazdırma + değişiklik geçmişi.
   Bu ekranın bir de mobil hali önemli: teknisyen QR okutup buraya düşecek.

6. ADRES SEÇİCİ BİLEŞENİ — sistemin en karmaşık parçası
   İl açılır listesi (81 kayıt) → ilçe açılır listesi (il seçilince yüklenir) →
   mahalle typeahead (asla tam liste basılmaz, en az 2 karakter, en fazla 20 sonuç) →
   sokak, dış kapı no, iç kapı no → serbest metin adres tarifi (zorunlu) → harita.
   Harita iki yönlü çalışıyor: adres seçilince harita oraya gidiyor; haritada pin
   sürüklenince alanlar otomatik doluyor ama kullanıcı düzeltebiliyor.
   Tasarlaman gereken zor durumlar:
   - "Mahalle bulunamadı" — akış tıkanmamalı, adres tarifi alanına yönlendirmeli
   - Harita bir mahalle önerdi ama emin değil — öneri kilitlenmemeli, düzeltilebilmeli
   - Konum hiç girilmedi — zorunlu değil ama uyarı görünmeli
   Bu bileşenin hem masaüstü hem mobil hali gerekli. Mobilde harita ile form aynı ekrana
   sığmıyor; bunu çöz.

7. SÖZLEŞME DETAYI — rol bazlı alan gizleme
   Sözleşme bilgileri + kapsamındaki asansör listesi + mali bilgiler (aylık ücret, KDV,
   birim fiyat) + imzalı PDF eki + fesih/yenile aksiyonları.
   Kritik: `operations` rolü mali alanları GÖRMEZ, `accountant` teknik künyeyi GÖRMEZ.
   Aynı ekranı üç rol için ayrı ayrı göster. Gizlenen alan yerine ne konacak — boşluk mu,
   kilit ikonu mu, hiç mi görünmeyecek? Karar ver ve gerekçelendir.
   Ayrıca "sözleşmeyi feshet" gibi geri alınamaz aksiyonların onay akışını tasarla.

8. QR ETİKET YAZDIRMA
   Ekranda: seçilen asansörlerin listesi + önizleme + yazdır.
   Çıktıda: A4'te 3x4 = 12 etiket. Her etikette QR (minimum 25x25 mm), asansör adı, bina adı,
   asansör kimlik no, firma logosu ve telefonu — hepsi Türkçe.
   Etiket makine dairesinde, loş ışıkta, kirli ve yıpranmış yüzeyde okunacak. Baskı
   tasarımını buna göre yap: yüksek kontrast, kalın tipografi, ince çizgi kullanma.
   A4 sayfa düzenini gerçek ölçülerle göster.

Her ekranın altına, aldığın tasarım kararlarını 2-3 cümleyle gerekçelendir.
```

---

## AŞAMA 3 — Durum matrisi ve kenar durumlar

> Aşama 2 onaylandıktan sonra gönder. Uygulamada asıl zamanı yiyen kısım burası.

```
Ekranlar onaylandı. Şimdi her ekranın "mutlu yol" dışındaki hallerini tasarla.
Bunlar sonradan düşünülürse ekranların yarısı yeniden yazılıyor.

1. BOŞ DURUMLAR — yeni bir firma sisteme girdiğinde beş boş liste görüyor: müşteri,
   bina, asansör, sözleşme, kullanıcı. Her boş durum bir sonraki adımı önermeli ve
   birbirine bağlanmalı (müşteri yoksa bina eklenemez, bina yoksa asansör eklenemez).
   Bu zinciri bir onboarding akışına çevir — ayrı bir sihirbaz ekranı yapmadan,
   boş durumların kendisiyle.
   Ayrıca "filtre sonucu boş" durumu, "hiç kayıt yok" durumundan farklı görünmeli.

2. YÜKLENİYOR DURUMLARI — tablo iskeleti, form iskeleti, harita yükleniyor,
   typeahead arıyor, dosya yükleniyor (yüzde göstergeli), PDF üretiliyor.

3. HATA DURUMLARI — backend Türkçe mesaj döndürmüyor, makine okunabilir kod döndürüyor
   ve çeviriyi arayüz yapıyor. Şu senaryoları tasarla:
   - Alan bazlı doğrulama hatası (vergi no geçersiz, bitiş tarihi başlangıçtan önce)
   - 409 çakışma: "asansörü olan bina silinemez" — kullanıcıya ne yapması gerektiğini söyle
   - 422 iş kuralı: "bu asansör zaten aktif bir sözleşmede"
   - 403 yetkisiz — ama menüde zaten gizliyse buraya nasıl düştü? (doğrudan URL)
   - 404 / tenant ihlali
   - 500 — gövdesinde `request_id` var, kullanıcı destek ekibine bunu okuyacak.
     Bu kimliği kolay kopyalanır biçimde göster.
   - Ağ yok / backend erişilemiyor
   - Oturum süresi doldu — kullanıcı formu yarım doldurmuşken. Veri kaybolmamalı.

4. BİLİNMEYEN ENUM DEĞERİ — backend yeni bir asansör kategorisi eklediğinde eski arayüz
   çeviri karşılığını bulamıyor. Kural: çökmeyecek, boş göstermeyecek, ham değeri gösterecek.
   Bunun görsel halini tasarla — ham değer nasıl görünecek ki kullanıcı "bozuk" sanmasın?

5. ONAY VE GERİ ALINAMAZ AKSİYONLAR — silme (soft delete ama kullanıcı için "silme"),
   sözleşme feshi, kullanıcı pasifleştirme, QR token yenileme (eski etiketler geçersiz olur).
   Her biri farklı ağırlıkta. Aynı onay diyaloğunu hepsine kullanma; ağırlığa göre kademele.

6. MOBİL KIRILIMLAR — Aşama 2'deki sekiz ekranın telefon hali. Teknisyenin Faz 2'de
   sahada kullanacağı akış: QR okut → asansör detayı. Bu yolun her adımı tek elle,
   eldivenle, loş ışıkta çalışmalı.

Çıktıyı yine tek HTML artifact olarak ver, durumları bölüm bölüm göster.
```

---

## Tasarım geldikten sonra

Kod fazına geçmeden önce tasarımdan şu üç şeyin çıkarılması gerekiyor:

1. `src/app/globals.css` içine CSS değişkenleri (açık + koyu tema)
2. `tailwind.config.ts` içine token eşlemesi
3. `messages/tr.json` iskeleti — tasarımda görünen her metin buraya anahtarlanacak.
   Tasarımdan doğrudan çıkarılabilir; kod yazılırken tekrar düşünülmez.
