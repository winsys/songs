(function () {
  'use strict';

  var COPY = {
    ru: {
      skip: 'К содержанию', login: 'Открыть систему',
      heroKicker: 'Вся команда служения — в одной системе',
      heroTitle: 'От первой песни до последнего экрана.',
      heroCopy: 'Worship Songs связывает ведущего, музыкантов, проповедника, техника и общину — без установки программ и пересылки файлов.',
      heroCta: 'Перейти в Worship Songs', heroNote: 'Работает в браузере на компьютере, планшете и телефоне',
      heroCaption: 'Один выбор ведущего одновременно обновляет ноты музыкантов, слова в зале и экран трансляции.',
      introLibrary: 'Единая библиотека', introLibraryCopy: 'Песни, Библия, Послания, проповеди и медиа.',
      introRoles: 'Роли без лишнего', introRolesCopy: 'Каждый видит только нужные ему инструменты.',
      introSync: 'Синхронно в реальном времени', introSyncCopy: 'Зал, трансляция, ноты и телефоны группы.',
      scenariosEyebrow: 'Три сценария', scenariosTitle: 'Одна система сопровождает всё служение.',
      scenariosDeck: 'Она не заменяет людей — она убирает разрыв между их экранами, материалами и действиями.',
      worshipTitle: 'Прославление в зале', worshipCopy: 'Ведущий собирает порядок песен и переключает куплеты. Музыканты получают ноты или аккорды, техник управляет словами, фоном, видео и отдельным экраном для трансляции.',
      sermonTitle: 'Подготовка и проведение проповеди', sermonCopy: 'Проповедник готовит личные заметки, вставляет цитаты Библии, изображения, видео и слайды. Во время проповеди одно касание выводит выбранный материал на экран.',
      groupTitle: 'Группа в зале и за его пределами', groupCopy: 'Наблюдатели открывают песни, переводы Библии и Послания на телефоне. В групповом режиме их экраны пассивно следуют за ведущим или техником.',
      tagSetlist: 'Порядок песен', tagNotes: 'Ноты и аккорды', tagStream: 'Зал + трансляция', tagPrivate: 'Личные заметки', tagCitations: 'Живые цитаты', tagMedia: 'Слайды и видео', tagQr: 'Вход по QR', tagLanguages: 'Несколько языков', tagFollow: 'Режим следования',
      rolesEyebrow: 'Команда', rolesTitle: 'Свой рабочий экран для каждой роли.', rolesDeck: 'Интерфейсы связаны общим состоянием служения, но не перегружены чужими функциями.',
      roleLeader: 'Ведущий', roleLeaderCopy: 'Порядок песен, куплеты, ноты и трансляция группе.', roleMusician: 'Музыкант', roleMusicianCopy: 'Актуальная песня, выбранная группа изображений и крупные ноты.', rolePiano: 'Пианист', rolePianoCopy: 'Личный список песен без влияния на общий экран.', roleObserver: 'Наблюдатель', roleObserverCopy: 'Песни, Библия, Послания и история на телефоне.', roleTech: 'Техник', roleTechCopy: 'Экраны, тексты, переводы, медиа и плейлист.', rolePreacher: 'Проповедник', rolePreacherCopy: 'Редактор заметок и управление материалами во время речи.', roleAdmin: 'Администратор', roleAdminCopy: 'Пользователи, сборники, языки, экраны и импорт.', roleScreens: 'Экраны', roleScreensCopy: 'Раздельная выдача для зала и видеотрансляции.',
      uiEyebrow: 'Интерфейс', uiTitle: 'Рабочие окна, а не демонстрационные макеты.', uiDeck: 'Система адаптируется к задаче: плотный пульт техника на большом экране и быстрый просмотр для участника на телефоне.', uiTech: 'Технический режим', uiPrep: 'Подготовка проповеди', uiLeader: 'Ведущий', uiObserver: 'Наблюдатель', uiMobile: 'мобильный',
      featuresEyebrow: 'Возможности', featuresTitle: 'Всё, что должно работать вместе.',
      featureLibrary: 'Материалы', featureLibraryCopy: 'Полнотекстовый поиск песен, языки контента, переводы Библии, Послания и сохранённые проповеди.',
      featureBible: 'Параллельная Библия', featureBibleCopy: 'Несколько переводов на одном экране с корректным сопоставлением различающейся нумерации стихов.',
      featureMedia: 'Медиа', featureMediaCopy: 'Изображения, локальное видео, YouTube, аудио, заставки и синхронизация позиции видео.',
      featureSermons: 'Проповеди', featureSermonsCopy: 'Автосохранение, форматирование, цитаты, слайды, импорт draw.io и экспорт материалов.',
      featureChannels: 'Несколько каналов', featureChannelsCopy: 'Главный экран, экран трансляции, отдельный канал нот музыкантам и канал группы наблюдателей.',
      featureAdmin: 'Управление', featureAdminCopy: 'Роли и доступы, оформление экранов, импорт данных, Google-вход и работа нескольких общин.',
      closeTitle: 'Служение остаётся живым. Техника становится понятной.', closeCopy: 'Worship Songs открывается в браузере и объединяет подготовку, проведение и участие — в одном согласованном процессе.', closeCta: 'Открыть систему', footer: 'Система управления богослужением', zoom: 'Увеличить изображение', close: 'Закрыть'
    },
    en: {
      skip: 'Skip to content', login: 'Open the system', heroKicker: 'The whole ministry team in one system', heroTitle: 'From the first song to the final screen.', heroCopy: 'Worship Songs connects the leader, musicians, preacher, technician and congregation — without software installation or passing files around.', heroCta: 'Go to Worship Songs', heroNote: 'Runs in a browser on desktop, tablet and phone', heroCaption: 'One choice by the leader updates the musicians’ sheet music, the hall lyrics and the streaming screen.',
      introLibrary: 'One library', introLibraryCopy: 'Songs, Bible, Messages, sermons and media.', introRoles: 'Focused roles', introRolesCopy: 'Everyone sees only the tools they need.', introSync: 'Real-time sync', introSyncCopy: 'Hall, stream, sheet music and group phones.',
      scenariosEyebrow: 'Three scenarios', scenariosTitle: 'One system accompanies the entire service.', scenariosDeck: 'It does not replace people — it removes the gaps between their screens, materials and actions.', worshipTitle: 'Worship in the hall', worshipCopy: 'The leader builds the setlist and changes verses. Musicians receive sheet music or chords, while the technician controls lyrics, backgrounds, video and a separate streaming screen.', sermonTitle: 'Preparing and delivering a sermon', sermonCopy: 'The preacher prepares personal notes and inserts Bible quotations, images, videos and slides. During the sermon, one tap puts the selected material on the screen.', groupTitle: 'The group in the hall and beyond', groupCopy: 'Observers open songs, Bible translations and Messages on their phones. In group mode, their screens passively follow the leader or technician.',
      tagSetlist: 'Setlist', tagNotes: 'Sheet music and chords', tagStream: 'Hall + stream', tagPrivate: 'Personal notes', tagCitations: 'Live quotations', tagMedia: 'Slides and video', tagQr: 'QR sign-in', tagLanguages: 'Multiple languages', tagFollow: 'Follow mode',
      rolesEyebrow: 'The team', rolesTitle: 'A focused workspace for every role.', rolesDeck: 'The interfaces share the current service state without loading users with tools they do not need.', roleLeader: 'Leader', roleLeaderCopy: 'Setlist, verses, sheet music and group broadcast.', roleMusician: 'Musician', roleMusicianCopy: 'Current song, selected image group and large sheet music.', rolePiano: 'Pianist', rolePianoCopy: 'A personal song list that does not affect the shared screen.', roleObserver: 'Observer', roleObserverCopy: 'Songs, Bible, Messages and history on a phone.', roleTech: 'Technician', roleTechCopy: 'Screens, texts, translations, media and playlist.', rolePreacher: 'Preacher', rolePreacherCopy: 'Note editor and control of materials while speaking.', roleAdmin: 'Administrator', roleAdminCopy: 'Users, collections, languages, screens and import.', roleScreens: 'Screens', roleScreensCopy: 'Separate output for the hall and video stream.',
      uiEyebrow: 'Interface', uiTitle: 'Working interfaces, not demonstration mockups.', uiDeck: 'The system fits the task: a dense technical console on a large display and quick reading for a participant on a phone.', uiTech: 'Technical mode', uiPrep: 'Sermon preparation', uiLeader: 'Leader', uiObserver: 'Observer', uiMobile: 'mobile',
      featuresEyebrow: 'Capabilities', featuresTitle: 'Everything that needs to work together.', featureLibrary: 'Materials', featureLibraryCopy: 'Full-text song search, content languages, Bible translations, Messages and saved sermons.', featureBible: 'Parallel Bible', featureBibleCopy: 'Several translations on one screen with correct mapping where verse numbering differs.', featureMedia: 'Media', featureMediaCopy: 'Images, local video, YouTube, audio, wallpapers and video-position synchronization.', featureSermons: 'Sermons', featureSermonsCopy: 'Autosave, formatting, quotations, slides, draw.io import and material export.', featureChannels: 'Multiple channels', featureChannelsCopy: 'Main display, streaming display, a separate sheet-music channel for musicians and the observer group channel.', featureAdmin: 'Management', featureAdminCopy: 'Roles and access, screen appearance, data import, Google sign-in and work of several churches.', closeTitle: 'The service stays human. The technology becomes clear.', closeCopy: 'Worship Songs runs in a browser and joins preparation, delivery and participation into one coordinated process.', closeCta: 'Open the system', footer: 'Worship service management system', zoom: 'Enlarge image', close: 'Close'
    },
    de: {
      skip: 'Zum Inhalt', login: 'System öffnen', heroKicker: 'Das gesamte Gottesdienstteam in einem System', heroTitle: 'Vom ersten Lied bis zum letzten Bildschirm.', heroCopy: 'Worship Songs verbindet Leitung, Musiker, Prediger, Technik und Gemeinde — ohne Installation und ohne Dateiversand.', heroCta: 'Zu Worship Songs', heroNote: 'Läuft im Browser auf Computer, Tablet und Smartphone', heroCaption: 'Eine Auswahl der Leitung aktualisiert gleichzeitig Noten, Saaltext und Streaming-Bildschirm.',
      introLibrary: 'Eine Bibliothek', introLibraryCopy: 'Lieder, Bibel, Botschaften, Predigten und Medien.', introRoles: 'Klare Rollen', introRolesCopy: 'Jeder sieht nur die benötigten Werkzeuge.', introSync: 'Synchron in Echtzeit', introSyncCopy: 'Saal, Stream, Noten und Telefone der Gruppe.',
      scenariosEyebrow: 'Drei Szenarien', scenariosTitle: 'Ein System begleitet den ganzen Gottesdienst.', scenariosDeck: 'Es ersetzt keine Menschen — es schließt die Lücken zwischen Bildschirmen, Materialien und Handlungen.', worshipTitle: 'Lobpreis im Saal', worshipCopy: 'Die Leitung erstellt die Liedfolge und wechselt Strophen. Musiker erhalten Noten oder Akkorde; die Technik steuert Text, Hintergrund, Video und den separaten Streaming-Bildschirm.', sermonTitle: 'Predigt vorbereiten und halten', sermonCopy: 'Der Prediger bereitet persönliche Notizen vor und fügt Bibelzitate, Bilder, Videos und Folien ein. Während der Predigt bringt eine Berührung das gewählte Material auf den Bildschirm.', groupTitle: 'Die Gruppe im Saal und außerhalb', groupCopy: 'Beobachter öffnen Lieder, Bibelübersetzungen und Botschaften auf dem Smartphone. Im Gruppenmodus folgen ihre Bildschirme passiv dem Einleiter oder dem Techniker.',
      tagSetlist: 'Liedfolge', tagNotes: 'Noten und Akkorde', tagStream: 'Saal + Stream', tagPrivate: 'Persönliche Notizen', tagCitations: 'Live-Zitate', tagMedia: 'Folien und Video', tagQr: 'Anmeldung per QR', tagLanguages: 'Mehrere Sprachen', tagFollow: 'Folgemodus',
      rolesEyebrow: 'Das Team', rolesTitle: 'Ein eigener Arbeitsbereich für jede Rolle.', rolesDeck: 'Alle Oberflächen teilen den aktuellen Gottesdienstzustand, ohne unnötige Funktionen zu zeigen.', roleLeader: 'Einleiter', roleLeaderCopy: 'Liedfolge, Strophen, Noten und Gruppensendung.', roleMusician: 'Musiker', roleMusicianCopy: 'Aktuelles Lied, gewählte Bildgruppe und große Noten.', rolePiano: 'Pianist', rolePianoCopy: 'Persönliche Liedliste ohne Einfluss auf den gemeinsamen Bildschirm.', roleObserver: 'Beobachter', roleObserverCopy: 'Lieder, Bibel, Botschaften und Verlauf am Smartphone.', roleTech: 'Techniker', roleTechCopy: 'Bildschirme, Texte, Übersetzungen, Medien und Playlist.', rolePreacher: 'Prediger', rolePreacherCopy: 'Notizeditor und Steuerung der Materialien während der Predigt.', roleAdmin: 'Administrator', roleAdminCopy: 'Benutzer, Sammlungen, Sprachen, Bildschirme und Import.', roleScreens: 'Bildschirme', roleScreensCopy: 'Getrennte Ausgabe für Saal und Videostream.',
      uiEyebrow: 'Oberfläche', uiTitle: 'Echte Arbeitsfenster statt Demo-Mockups.', uiDeck: 'Das System passt zur Aufgabe: ein dichter Technikpult auf dem großen Bildschirm und schnelles Lesen auf dem Smartphone.', uiTech: 'Technischer Modus', uiPrep: 'Predigtvorbereitung', uiLeader: 'Einleiter', uiObserver: 'Beobachter', uiMobile: 'mobil',
      featuresEyebrow: 'Funktionen', featuresTitle: 'Alles, was zusammenarbeiten muss.', featureLibrary: 'Materialien', featureLibraryCopy: 'Volltextsuche in Liedern, Inhaltssprachen, Bibelübersetzungen, Botschaften und gespeicherte Predigten.', featureBible: 'Parallele Bibel', featureBibleCopy: 'Mehrere Übersetzungen auf einem Bildschirm mit korrekter Zuordnung abweichender Versnummerierung.', featureMedia: 'Medien', featureMediaCopy: 'Bilder, lokale Videos, YouTube, Audio, Hintergründe und Synchronisierung der Videoposition.', featureSermons: 'Predigten', featureSermonsCopy: 'Automatisches Speichern, Formatierung, Zitate, Folien, draw.io-Import und Export von Materialien.', featureChannels: 'Mehrere Kanäle', featureChannelsCopy: 'Hauptbildschirm, Streaming-Bildschirm, eigener Notenkanal für Musiker und Kanal der Beobachtergruppe.', featureAdmin: 'Verwaltung', featureAdminCopy: 'Rollen und Zugänge, Bildschirmgestaltung, Datenimport, Google-Anmeldung und Arbeit mehrerer Gemeinden.', closeTitle: 'Der Gottesdienst bleibt lebendig. Die Technik wird verständlich.', closeCopy: 'Worship Songs läuft im Browser und verbindet Vorbereitung, Durchführung und Teilnahme zu einem abgestimmten Prozess.', closeCta: 'System öffnen', footer: 'System zur Gottesdienstverwaltung', zoom: 'Bild vergrößern', close: 'Schließen'
    },
    lt: {
      skip: 'Pereiti prie turinio', login: 'Atidaryti sistemą', heroKicker: 'Visa tarnavimo komanda vienoje sistemoje', heroTitle: 'Nuo pirmos giesmės iki paskutinio ekrano.', heroCopy: 'Worship Songs sujungia vadovą, muzikantus, pamokslininką, techniką ir bendruomenę — be programų diegimo ir failų siuntinėjimo.', heroCta: 'Eiti į Worship Songs', heroNote: 'Veikia naršyklėje kompiuteryje, planšetėje ir telefone', heroCaption: 'Vienas vadovo pasirinkimas vienu metu atnaujina muzikantų natas, žodžius salėje ir transliacijos ekraną.',
      introLibrary: 'Bendra biblioteka', introLibraryCopy: 'Giesmės, Biblija, Žinios, pamokslai ir medija.', introRoles: 'Aiškios rolės', introRolesCopy: 'Kiekvienas mato tik jam reikalingus įrankius.', introSync: 'Sinchroniškai realiu laiku', introSyncCopy: 'Salė, transliacija, natos ir grupės telefonai.',
      scenariosEyebrow: 'Trys scenarijai', scenariosTitle: 'Viena sistema lydi visas pamaldas.', scenariosDeck: 'Ji nepakeičia žmonių — ji pašalina tarpus tarp jų ekranų, medžiagos ir veiksmų.', worshipTitle: 'Šlovinimas salėje', worshipCopy: 'Vadovas sudaro giesmių eilę ir perjungia posmus. Muzikantai gauna natas ar akordus, o technikas valdo žodžius, foną, vaizdo įrašus ir atskirą transliacijos ekraną.', sermonTitle: 'Pamokslo ruošimas ir sakymas', sermonCopy: 'Pamokslininkas ruošia asmeninius užrašus, įterpia Biblijos citatas, vaizdus, vaizdo įrašus ir skaidres. Pamokslo metu vienas palietimas parodo pasirinktą medžiagą ekrane.', groupTitle: 'Grupė salėje ir už jos ribų', groupCopy: 'Stebėtojai telefone atidaro giesmes, Biblijos vertimus ir Žinias. Grupės režimu jų ekranai pasyviai seka vedėją arba techniką.',
      tagSetlist: 'Giesmių eilė', tagNotes: 'Natos ir akordai', tagStream: 'Salė + transliacija', tagPrivate: 'Asmeniniai užrašai', tagCitations: 'Gyvos citatos', tagMedia: 'Skaidrės ir vaizdo įrašai', tagQr: 'Prisijungimas per QR', tagLanguages: 'Kelios kalbos', tagFollow: 'Sekimo režimas',
      rolesEyebrow: 'Komanda', rolesTitle: 'Kiekvienai rolei — sava darbo erdvė.', rolesDeck: 'Sąsajos dalijasi pamaldų būsena, bet nerodo nereikalingų funkcijų.', roleLeader: 'Vedėjas', roleLeaderCopy: 'Giesmių eilė, posmai, natos ir transliacija grupei.', roleMusician: 'Muzikantas', roleMusicianCopy: 'Dabartinė giesmė, pasirinkta vaizdų grupė ir didelės natos.', rolePiano: 'Pianistas', rolePianoCopy: 'Asmeninis giesmių sąrašas, neturintis įtakos bendram ekranui.', roleObserver: 'Stebėtojas', roleObserverCopy: 'Giesmės, Biblija, Žinios ir istorija telefone.', roleTech: 'Technikas', roleTechCopy: 'Ekranai, tekstai, vertimai, medija ir grojaraštis.', rolePreacher: 'Pamokslininkas', rolePreacherCopy: 'Užrašų redaktorius ir medžiagos valdymas kalbant.', roleAdmin: 'Administratorius', roleAdminCopy: 'Naudotojai, rinkiniai, kalbos, ekranai ir importas.', roleScreens: 'Ekranai', roleScreensCopy: 'Atskiras vaizdas salei ir vaizdo transliacijai.',
      uiEyebrow: 'Sąsaja', uiTitle: 'Tikri darbo langai, ne demonstraciniai maketai.', uiDeck: 'Sistema prisitaiko prie užduoties: tankus techninis pultas dideliame ekrane ir greitas skaitymas telefone.', uiTech: 'Techninis režimas', uiPrep: 'Pamokslo ruošimas', uiLeader: 'Vedėjas', uiObserver: 'Stebėtojas', uiMobile: 'mobilus',
      featuresEyebrow: 'Galimybės', featuresTitle: 'Viskas, kas turi veikti kartu.', featureLibrary: 'Medžiaga', featureLibraryCopy: 'Giesmių paieška pagal visą tekstą, turinio kalbos, Biblijos vertimai, Žinios ir išsaugoti pamokslai.', featureBible: 'Lygiagreti Biblija', featureBibleCopy: 'Keli vertimai viename ekrane su teisingu skirtingos eilučių numeracijos susiejimu.', featureMedia: 'Medija', featureMediaCopy: 'Vaizdai, vietiniai vaizdo įrašai, YouTube, garsas, fonai ir vaizdo pozicijos sinchronizavimas.', featureSermons: 'Pamokslai', featureSermonsCopy: 'Automatinis išsaugojimas, formatavimas, citatos, skaidrės, draw.io importas ir medžiagos eksportas.', featureChannels: 'Keli kanalai', featureChannelsCopy: 'Pagrindinis ekranas, transliacijos ekranas, atskiras natų kanalas muzikantams ir stebėtojų grupės kanalas.', featureAdmin: 'Valdymas', featureAdminCopy: 'Vaidmenys ir prieigos, ekranų išvaizda, duomenų importas, Google prisijungimas ir kelių bendruomenių darbas.', closeTitle: 'Pamaldos lieka gyvos. Technika tampa suprantama.', closeCopy: 'Worship Songs veikia naršyklėje ir sujungia ruošimą, vedimą bei dalyvavimą į vieną suderintą procesą.', closeCta: 'Atidaryti sistemą', footer: 'Pamaldų valdymo sistema', zoom: 'Padidinti vaizdą', close: 'Uždaryti'
    },
    pl: {
      skip: 'Przejdź do treści', login: 'Otwórz system', heroKicker: 'Cały zespół służby w jednym systemie', heroTitle: 'Od pierwszej pieśni do ostatniego ekranu.', heroCopy: 'Worship Songs łączy prowadzącego, muzyków, kaznodzieję, technika i wspólnotę — bez instalowania programów i przesyłania plików.', heroCta: 'Przejdź do Worship Songs', heroNote: 'Działa w przeglądarce na komputerze, tablecie i telefonie', heroCaption: 'Jeden wybór prowadzącego aktualizuje nuty muzyków, tekst w sali i ekran transmisji.',
      introLibrary: 'Wspólna biblioteka', introLibraryCopy: 'Pieśni, Biblia, Poselstwa, kazania i media.', introRoles: 'Jasne role', introRolesCopy: 'Każdy widzi tylko potrzebne narzędzia.', introSync: 'Synchronizacja na żywo', introSyncCopy: 'Sala, transmisja, nuty i telefony grupy.',
      scenariosEyebrow: 'Trzy scenariusze', scenariosTitle: 'Jeden system wspiera całe nabożeństwo.', scenariosDeck: 'Nie zastępuje ludzi — usuwa przerwy między ich ekranami, materiałami i działaniami.', worshipTitle: 'Uwielbienie w sali', worshipCopy: 'Prowadzący układa kolejność pieśni i zmienia zwrotki. Muzycy otrzymują nuty lub akordy, a technik steruje tekstem, tłem, wideo i osobnym ekranem transmisji.', sermonTitle: 'Przygotowanie i wygłaszanie kazania', sermonCopy: 'Kaznodzieja przygotowuje osobiste notatki oraz wstawia cytaty biblijne, obrazy, wideo i slajdy. Podczas kazania jedno dotknięcie wyświetla wybrany materiał na ekranie.', groupTitle: 'Grupa w sali i poza nią', groupCopy: 'Obserwatorzy otwierają w telefonie pieśni, przekłady Biblii i Poselstwa. W trybie grupowym ich ekrany biernie podążają za prowadzącym lub technikiem.',
      tagSetlist: 'Kolejność pieśni', tagNotes: 'Nuty i akordy', tagStream: 'Sala + transmisja', tagPrivate: 'Osobiste notatki', tagCitations: 'Żywe cytaty', tagMedia: 'Slajdy i wideo', tagQr: 'Logowanie przez QR', tagLanguages: 'Wiele języków', tagFollow: 'Tryb śledzenia',
      rolesEyebrow: 'Zespół', rolesTitle: 'Osobne miejsce pracy dla każdej roli.', rolesDeck: 'Interfejsy współdzielą stan nabożeństwa, ale nie pokazują zbędnych funkcji.', roleLeader: 'Prowadzący', roleLeaderCopy: 'Kolejność pieśni, zwrotki, nuty i transmisja do grupy.', roleMusician: 'Muzyk', roleMusicianCopy: 'Bieżąca pieśń, wybrana grupa obrazów i duże nuty.', rolePiano: 'Pianista', rolePianoCopy: 'Osobista lista pieśni bez wpływu na wspólny ekran.', roleObserver: 'Obserwator', roleObserverCopy: 'Pieśni, Biblia, Poselstwa i historia w telefonie.', roleTech: 'Technik', roleTechCopy: 'Ekrany, teksty, przekłady, media i lista odtwarzania.', rolePreacher: 'Kaznodzieja', rolePreacherCopy: 'Edytor notatek i sterowanie materiałami podczas wystąpienia.', roleAdmin: 'Administrator', roleAdminCopy: 'Użytkownicy, zbiory, języki, ekrany i import.', roleScreens: 'Ekrany', roleScreensCopy: 'Oddzielny obraz dla sali i transmisji wideo.',
      uiEyebrow: 'Interfejs', uiTitle: 'Prawdziwe okna pracy, nie demonstracyjne makiety.', uiDeck: 'System dopasowuje się do zadania: rozbudowany pulpit technika na dużym ekranie i szybki podgląd na telefonie.', uiTech: 'Tryb techniczny', uiPrep: 'Przygotowanie kazania', uiLeader: 'Prowadzący', uiObserver: 'Obserwator', uiMobile: 'mobilny',
      featuresEyebrow: 'Możliwości', featuresTitle: 'Wszystko, co powinno działać razem.', featureLibrary: 'Materiały', featureLibraryCopy: 'Wyszukiwanie pełnotekstowe pieśni, języki treści, przekłady Biblii, Poselstwa i zapisane kazania.', featureBible: 'Biblia równoległa', featureBibleCopy: 'Kilka przekładów na jednym ekranie z prawidłowym mapowaniem różnej numeracji wersetów.', featureMedia: 'Media', featureMediaCopy: 'Obrazy, lokalne wideo, YouTube, audio, tła i synchronizacja pozycji filmu.', featureSermons: 'Kazania', featureSermonsCopy: 'Autozapis, formatowanie, cytaty, slajdy, import draw.io i eksport materiałów.', featureChannels: 'Wiele kanałów', featureChannelsCopy: 'Ekran główny, ekran transmisji, osobny kanał nut dla muzyków i kanał grupy obserwatorów.', featureAdmin: 'Zarządzanie', featureAdminCopy: 'Role i dostępy, wygląd ekranów, import danych, logowanie Google i praca wielu kościołów.', closeTitle: 'Nabożeństwo pozostaje żywe. Technika staje się zrozumiała.', closeCopy: 'Worship Songs działa w przeglądarce i łączy przygotowanie, prowadzenie oraz uczestnictwo w jeden spójny proces.', closeCta: 'Otwórz system', footer: 'System zarządzania nabożeństwem', zoom: 'Powiększ obraz', close: 'Zamknij'
    }
  };

  // Keep the presentation copy factual across every design variant.
  var PLAIN_COPY = {
    ru: {
      heroKicker: 'Некоммерческий проект для церквей',
      heroTitle: 'Песни, тексты и экраны для церковной команды.',
      heroCopy: 'Worship Songs создана, чтобы помогать другим церквям готовить и проводить богослужения. Ведущий, музыканты, проповедник и техник работают с общими материалами.',
      heroCaption: 'Ведущий выбирает песню. Её куплеты доступны технику, а ноты — музыкантам.',
      introLibrary: 'Материалы в одном месте',
      introLibraryCopy: 'Песни, ноты, переводы Библии, Послания и проповеди.',
      introRoles: 'Инструменты по роли',
      introRolesCopy: 'У каждого участника свой рабочий экран.',
      introSync: 'Обновления без пересылки',
      introSyncCopy: 'Выбранная песня и её куплеты доступны технику.',
      scenariosTitle: 'Как система помогает во время служения',
      scenariosDeck: 'Три обычные задачи: работа с песнями, проведение проповеди и доступ к текстам на телефоне.',
      worshipCopy: 'Ведущий собирает порядок песен и выбирает песню. Её куплеты появляются у техника, который обычно переключает их на экранах. При необходимости ведущий может переключать куплеты сам. Музыканты видят ноты или аккорды.',
      roleLeaderCopy: 'Выбор песен, ноты и возможность самому переключать куплеты.',
      rolesTitle: 'Для каждого участника есть свой режим',
      rolesDeck: 'Набор действий зависит от того, что человек делает во время служения.',
      uiTitle: 'Так выглядят рабочие экраны',
      uiDeck: 'Снимки действующей системы: пульт техника, редактор проповеди и страницы для телефона.',
      featuresTitle: 'Другие возможности',
      closeTitle: 'Если это полезно вашей церкви, присоединяйтесь.',
      closeCopy: 'Проект некоммерческий. На странице входа можно отправить запрос на доступ для своей церкви.'
    },
    en: {
      heroKicker: 'A non-commercial project for churches',
      heroTitle: 'Songs, texts and screens for church teams.',
      heroCopy: 'Worship Songs was built to help other churches prepare and conduct worship services. The leader, musicians, preacher and technician work with shared materials.',
      heroCaption: 'The leader selects a song. Its verses are available to the technician, and the sheet music to the musicians.',
      introLibrary: 'Materials in one place', introLibraryCopy: 'Songs, sheet music, Bible translations, Messages and sermons.',
      introRoles: 'Tools for each role', introRolesCopy: 'Every participant has their own working screen.',
      introSync: 'Updates without sending files', introSyncCopy: 'The selected song and its verses are available to the technician.',
      scenariosTitle: 'How the system helps during a service',
      scenariosDeck: 'Three common tasks: working with songs, delivering a sermon and accessing texts on a phone.',
      worshipCopy: 'The leader prepares the setlist and selects a song. Its verses appear on the technician’s computer; the technician normally advances them on the screens. The leader can also switch verses when needed. Musicians see sheet music or chords.',
      roleLeaderCopy: 'Song selection, sheet music and the option to switch verses yourself.',
      rolesTitle: 'Every participant has their own mode', rolesDeck: 'The available actions depend on what the person does during the service.',
      uiTitle: 'This is what the working screens look like', uiDeck: 'Screenshots of the live system: the technician’s console, the sermon editor and pages for phones.',
      featuresTitle: 'Other capabilities',
      closeTitle: 'If this is useful to your church, join us.',
      closeCopy: 'The project is non-commercial. On the sign-in page you can request access for your church.'
    },
    de: {
      heroKicker: 'Ein nichtkommerzielles Projekt für Gemeinden',
      heroTitle: 'Lieder, Texte und Bildschirme für Gemeindeteams.',
      heroCopy: 'Worship Songs wurde geschaffen, um anderen Gemeinden bei der Vorbereitung und Durchführung von Gottesdiensten zu helfen. Einleiter, Musiker, Prediger und Techniker arbeiten mit gemeinsamen Materialien.',
      heroCaption: 'Der Einleiter wählt ein Lied. Seine Strophen stehen dem Techniker zur Verfügung, die Noten den Musikern.',
      introLibrary: 'Materialien an einem Ort', introLibraryCopy: 'Lieder, Noten, Bibelübersetzungen, Botschaften und Predigten.',
      introRoles: 'Werkzeuge nach Rolle', introRolesCopy: 'Jeder Beteiligte hat seinen eigenen Arbeitsbildschirm.',
      introSync: 'Aktualisierungen ohne Dateiversand', introSyncCopy: 'Das gewählte Lied und seine Strophen stehen dem Techniker zur Verfügung.',
      scenariosTitle: 'So hilft das System im Gottesdienst',
      scenariosDeck: 'Drei typische Aufgaben: Arbeit mit Liedern, das Halten der Predigt und Zugriff auf Texte am Smartphone.',
      worshipCopy: 'Der Einleiter stellt die Liedfolge zusammen und wählt ein Lied. Dessen Strophen erscheinen beim Techniker, der sie normalerweise auf den Bildschirmen weiterschaltet. Bei Bedarf kann der Einleiter die Strophen selbst wechseln. Musiker sehen Noten oder Akkorde.',
      roleLeaderCopy: 'Liedauswahl, Noten und die Möglichkeit, Strophen selbst umzuschalten.',
      rolesTitle: 'Für jeden Beteiligten gibt es einen eigenen Modus', rolesDeck: 'Die verfügbaren Funktionen hängen davon ab, was jemand im Gottesdienst tut.',
      uiTitle: 'So sehen die Arbeitsbildschirme aus', uiDeck: 'Aufnahmen des laufenden Systems: Technikerpult, Predigteditor und Seiten für das Smartphone.',
      featuresTitle: 'Weitere Funktionen',
      closeTitle: 'Wenn das für Ihre Gemeinde nützlich ist, schließen Sie sich an.',
      closeCopy: 'Das Projekt ist nichtkommerziell. Auf der Anmeldeseite können Sie Zugang für Ihre Gemeinde anfragen.'
    },
    lt: {
      heroKicker: 'Nekomercinis projektas bažnyčioms',
      heroTitle: 'Giesmės, tekstai ir ekranai bažnyčios komandai.',
      heroCopy: 'Worship Songs sukurta padėti kitoms bažnyčioms ruoštis pamaldoms ir jas vesti. Vedėjas, muzikantai, pamokslininkas ir technikas dirba su bendra medžiaga.',
      heroCaption: 'Vedėjas pasirenka giesmę. Jos posmai prieinami technikui, o natos — muzikantams.',
      introLibrary: 'Medžiaga vienoje vietoje', introLibraryCopy: 'Giesmės, natos, Biblijos vertimai, Žinios ir pamokslai.',
      introRoles: 'Įrankiai pagal vaidmenį', introRolesCopy: 'Kiekvienas dalyvis turi savo darbo ekraną.',
      introSync: 'Atnaujinimai be failų siuntimo', introSyncCopy: 'Pasirinkta giesmė ir jos posmai prieinami technikui.',
      scenariosTitle: 'Kaip sistema padeda per pamaldas',
      scenariosDeck: 'Trys įprastos užduotys: darbas su giesmėmis, pamokslo sakymas ir prieiga prie tekstų telefone.',
      worshipCopy: 'Vedėjas sudaro giesmių eilę ir pasirenka giesmę. Jos posmai atsiranda techniko kompiuteryje; paprastai technikas juos perjungia ekranuose. Prireikus posmus gali perjungti ir pats vedėjas. Muzikantai mato natas arba akordus.',
      roleLeaderCopy: 'Giesmių pasirinkimas, natos ir galimybė pačiam perjungti posmus.',
      rolesTitle: 'Kiekvienam dalyviui — savas režimas', rolesDeck: 'Galimi veiksmai priklauso nuo to, ką žmogus daro per pamaldas.',
      uiTitle: 'Taip atrodo darbo ekranai', uiDeck: 'Veikiančios sistemos ekrano nuotraukos: techniko pultas, pamokslo redaktorius ir puslapiai telefonui.',
      featuresTitle: 'Kitos galimybės',
      closeTitle: 'Jei tai naudinga jūsų bažnyčiai, prisijunkite.',
      closeCopy: 'Tai nekomercinis projektas. Prisijungimo puslapyje galima pateikti prieigos užklausą savo bažnyčiai.'
    },
    pl: {
      heroKicker: 'Niekomercyjny projekt dla kościołów',
      heroTitle: 'Pieśni, teksty i ekrany dla zespołu kościelnego.',
      heroCopy: 'Worship Songs powstał, aby pomagać innym kościołom przygotowywać i prowadzić nabożeństwa. Prowadzący, muzycy, kaznodzieja i technik pracują ze wspólnymi materiałami.',
      heroCaption: 'Prowadzący wybiera pieśń. Jej zwrotki są dostępne dla technika, a nuty — dla muzyków.',
      introLibrary: 'Materiały w jednym miejscu', introLibraryCopy: 'Pieśni, nuty, przekłady Biblii, Poselstwa i kazania.',
      introRoles: 'Narzędzia według roli', introRolesCopy: 'Każdy uczestnik ma własny ekran roboczy.',
      introSync: 'Aktualizacje bez wysyłania plików', introSyncCopy: 'Wybrana pieśń i jej zwrotki są dostępne dla technika.',
      scenariosTitle: 'Jak system pomaga podczas nabożeństwa',
      scenariosDeck: 'Trzy typowe zadania: praca z pieśniami, wygłaszanie kazania i dostęp do tekstów w telefonie.',
      worshipCopy: 'Prowadzący układa kolejność pieśni i wybiera pieśń. Jej zwrotki pojawiają się na komputerze technika, który zwykle przełącza je na ekranach. W razie potrzeby prowadzący może przełączać zwrotki sam. Muzycy widzą nuty lub akordy.',
      roleLeaderCopy: 'Wybór pieśni, nuty i możliwość samodzielnego przełączania zwrotek.',
      rolesTitle: 'Każdy uczestnik ma swój tryb', rolesDeck: 'Dostępne działania zależą od zadania danej osoby podczas nabożeństwa.',
      uiTitle: 'Tak wyglądają ekrany robocze', uiDeck: 'Zrzuty ekranu działającego systemu: pulpit technika, edytor kazania i strony na telefon.',
      featuresTitle: 'Pozostałe możliwości',
      closeTitle: 'Jeśli to przyda się waszemu kościołowi, dołączcie.',
      closeCopy: 'To projekt niekomercyjny. Na stronie logowania można poprosić o dostęp dla swojego kościoła.'
    }
  };
  // Screenshot captions: one set of live-system screenshots per language
  // (images/ui/<lang>/<shot>.webp, switched together with the page language).
  var SHOT_COPY = {
    ru: {
      uiDeck: 'Снимки действующей системы: пульт техника, главный экран, проповедь, ноты музыканта и страницы для телефона.',
      uiSermon: 'Проповедь', uiScreen: 'Главный экран', uiMusician: 'Музыкант', uiTablet: 'планшет',
      uiTechAlt: 'Технический режим: песня на экране, выбран куплет на двух языках',
      uiSermonAlt: 'Проповедь: заметки проповедника и то, что сейчас на экране'
    },
    en: {
      uiDeck: 'Screenshots of the live system: the technician’s console, the main screen, the sermon, the musician’s sheet music and pages for phones.',
      uiSermon: 'Sermon', uiScreen: 'Main screen', uiMusician: 'Musician', uiTablet: 'tablet',
      uiTechAlt: 'Technical mode: a song on the screen, one verse selected in two languages',
      uiSermonAlt: 'Sermon: the preacher’s notes and what is on the screen now'
    },
    de: {
      uiDeck: 'Aufnahmen des laufenden Systems: Technikerpult, Hauptbildschirm, Predigt, Noten für Musiker und Seiten für das Smartphone.',
      uiSermon: 'Predigt', uiScreen: 'Hauptbildschirm', uiMusician: 'Musiker', uiTablet: 'Tablet',
      uiTechAlt: 'Technischer Modus: ein Lied auf dem Bildschirm, eine Strophe in zwei Sprachen ausgewählt',
      uiSermonAlt: 'Predigt: Notizen des Predigers und was gerade auf dem Bildschirm ist'
    },
    lt: {
      uiDeck: 'Veikiančios sistemos ekrano nuotraukos: techniko pultas, pagrindinis ekranas, pamokslas, muzikanto natos ir puslapiai telefonui.',
      uiSermon: 'Pamokslas', uiScreen: 'Pagrindinis ekranas', uiMusician: 'Muzikantas', uiTablet: 'planšetė',
      uiTechAlt: 'Techninis režimas: giesmė ekrane, pasirinktas posmas dviem kalbomis',
      uiSermonAlt: 'Pamokslas: pamokslininko užrašai ir tai, kas dabar rodoma ekrane'
    },
    pl: {
      uiDeck: 'Zrzuty ekranu działającego systemu: pulpit technika, ekran główny, kazanie, nuty muzyka i strony na telefon.',
      uiSermon: 'Kazanie', uiScreen: 'Ekran główny', uiMusician: 'Muzyk', uiTablet: 'tablet',
      uiTechAlt: 'Tryb techniczny: pieśń na ekranie, wybrana zwrotka w dwóch językach',
      uiSermonAlt: 'Kazanie: notatki kaznodziei i to, co jest teraz na ekranie'
    }
  };
  [PLAIN_COPY, SHOT_COPY].forEach(function (source) {
    Object.keys(source).forEach(function (lang) {
      Object.keys(source[lang]).forEach(function (key) {
        COPY[lang][key] = source[lang][key];
      });
    });
  });

  var TITLES = {
    ru: 'Worship Songs — система управления богослужением',
    en: 'Worship Songs — worship service management system',
    de: 'Worship Songs — System zur Gottesdienstverwaltung',
    lt: 'Worship Songs — pamaldų valdymo sistema',
    pl: 'Worship Songs — system zarządzania nabożeństwem'
  };

  function setLanguage(lang) {
    var dict = COPY[lang] || COPY.ru;
    lang = COPY[lang] ? lang : 'ru';
    document.documentElement.lang = lang;
    document.title = TITLES[lang];
    document.querySelectorAll('[data-t]').forEach(function (element) {
      var value = dict[element.getAttribute('data-t')];
      if (value !== undefined) element.textContent = value;
    });
    document.querySelectorAll('[data-t-aria]').forEach(function (element) {
      var value = dict[element.getAttribute('data-t-aria')];
      if (value !== undefined) element.setAttribute('aria-label', value);
    });
    document.querySelectorAll('[data-lang]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
    document.querySelectorAll('.zoom').forEach(function (button) {
      button.setAttribute('aria-label', dict.zoom);
    });
    var lightboxClose = document.querySelector('.lightbox-close');
    if (lightboxClose) lightboxClose.setAttribute('aria-label', dict.close);
    document.querySelectorAll('[data-scene]').forEach(function (image) {
      image.src = 'images/' + image.getAttribute('data-scene') + '-' + lang + '.png';
      var scene = image.getAttribute('data-scene');
      if (scene === 'worship-hall') image.alt = dict.worshipTitle;
      if (scene === 'sermon-hall') image.alt = dict.sermonTitle;
      if (scene === 'outdoor-group') image.alt = dict.groupTitle;
    });
    document.querySelectorAll('[data-shot]').forEach(function (image) {
      image.src = 'images/ui/' + lang + '/' + image.getAttribute('data-shot') + '.webp';
      var alt = dict[image.getAttribute('data-alt')];
      if (alt !== undefined) image.alt = alt;
    });
    try { localStorage.setItem('ws_promo_lang', lang); } catch (error) {}
  }

  function initLightbox() {
    var lightbox = document.querySelector('.lightbox');
    if (!lightbox) return;
    var image = lightbox.querySelector('img');
    var closeButton = lightbox.querySelector('.lightbox-close');
    var lastFocus = null;

    function close() {
      lightbox.classList.remove('open');
      document.body.classList.remove('locked');
      if (lastFocus) lastFocus.focus();
    }

    document.querySelectorAll('.zoom').forEach(function (button) {
      button.addEventListener('click', function () {
        var source = button.querySelector('img');
        lastFocus = button;
        image.src = source.src;
        image.alt = source.alt;
        lightbox.classList.add('open');
        document.body.classList.add('locked');
        closeButton.focus();
      });
    });
    closeButton.addEventListener('click', close);
    lightbox.addEventListener('click', function (event) { if (event.target === lightbox) close(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
  }

  document.querySelectorAll('[data-lang]').forEach(function (button) {
    button.addEventListener('click', function () { setLanguage(button.getAttribute('data-lang')); });
  });
  initLightbox();

  var initial = '';
  try { initial = localStorage.getItem('ws_promo_lang') || ''; } catch (error) {}
  if (!COPY[initial]) initial = (navigator.language || 'ru').slice(0, 2).toLowerCase();
  setLanguage(COPY[initial] ? initial : 'ru');
}());
