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
      introLibrary: 'Единая библиотека', introLibraryCopy: 'Песни, Библия, послания, проповеди и медиа.',
      introRoles: 'Роли без лишнего', introRolesCopy: 'Каждый видит только нужные ему инструменты.',
      introSync: 'Синхронно в реальном времени', introSyncCopy: 'Зал, трансляция, ноты и телефоны группы.',
      scenariosEyebrow: 'Три сценария', scenariosTitle: 'Одна система сопровождает всё служение.',
      scenariosDeck: 'Она не заменяет людей — она убирает разрыв между их экранами, материалами и действиями.',
      worshipTitle: 'Прославление в зале', worshipCopy: 'Ведущий собирает порядок песен и переключает куплеты. Музыканты получают ноты или аккорды, техник управляет словами, фоном, видео и отдельным экраном для трансляции.',
      sermonTitle: 'Подготовка и проведение проповеди', sermonCopy: 'Проповедник готовит личные заметки, вставляет цитаты Библии, изображения, видео и слайды. Во время проповеди одно касание выводит выбранный материал на экран.',
      groupTitle: 'Группа в зале и за его пределами', groupCopy: 'Наблюдатели открывают песни, переводы Библии и послания на телефоне. В групповом режиме их экраны пассивно следуют за ведущим или техником.',
      tagSetlist: 'Порядок песен', tagNotes: 'Ноты и аккорды', tagStream: 'Зал + трансляция', tagPrivate: 'Личные заметки', tagCitations: 'Живые цитаты', tagMedia: 'Слайды и видео', tagQr: 'Вход по QR', tagLanguages: 'Несколько языков', tagFollow: 'Режим следования',
      rolesEyebrow: 'Команда', rolesTitle: 'Свой рабочий экран для каждой роли.', rolesDeck: 'Интерфейсы связаны общим состоянием служения, но не перегружены чужими функциями.',
      roleLeader: 'Ведущий', roleLeaderCopy: 'Порядок песен, куплеты, ноты и трансляция группе.', roleMusician: 'Музыкант', roleMusicianCopy: 'Актуальная песня, выбранная группа изображений и крупные ноты.', rolePiano: 'Пианист', rolePianoCopy: 'Личный список песен без влияния на общий экран.', roleObserver: 'Наблюдатель', roleObserverCopy: 'Песни, Библия, послания и история на телефоне.', roleTech: 'Техник', roleTechCopy: 'Экраны, тексты, переводы, медиа и плейлист.', rolePreacher: 'Проповедник', rolePreacherCopy: 'Редактор заметок и управление материалами во время речи.', roleAdmin: 'Администратор', roleAdminCopy: 'Пользователи, сборники, языки, экраны и импорт.', roleScreens: 'Экраны', roleScreensCopy: 'Раздельная выдача для зала и видеотрансляции.',
      uiEyebrow: 'Интерфейс', uiTitle: 'Рабочие окна, а не демонстрационные макеты.', uiDeck: 'Система адаптируется к задаче: плотный пульт техника на большом экране и быстрый просмотр для участника на телефоне.', uiTech: 'Технический режим', uiPrep: 'Подготовка проповеди', uiLeader: 'Ведущий', uiObserver: 'Наблюдатель', uiMobile: 'мобильный',
      featuresEyebrow: 'Возможности', featuresTitle: 'Всё, что должно работать вместе.',
      featureLibrary: 'Материалы', featureLibraryCopy: 'Полнотекстовый поиск песен, языки контента, переводы Библии, послания и сохранённые проповеди.',
      featureBible: 'Параллельная Библия', featureBibleCopy: 'Несколько переводов на одном экране с корректным сопоставлением различающейся нумерации стихов.',
      featureMedia: 'Медиа', featureMediaCopy: 'Изображения, локальное видео, YouTube, аудио, заставки и синхронизация позиции видео.',
      featureSermons: 'Проповеди', featureSermonsCopy: 'Автосохранение, форматирование, цитаты, слайды, импорт draw.io и экспорт материалов.',
      featureChannels: 'Несколько каналов', featureChannelsCopy: 'Главный экран, экран трансляции, отдельный канал нот музыкантам и канал группы наблюдателей.',
      featureAdmin: 'Управление', featureAdminCopy: 'Роли и доступы, оформление экранов, импорт данных, Google-вход и работа нескольких общин.',
      closeTitle: 'Служение остаётся живым. Техника становится понятной.', closeCopy: 'Worship Songs открывается в браузере и объединяет подготовку, проведение и участие — в одном согласованном процессе.', closeCta: 'Открыть систему', footer: 'Система управления богослужением', zoom: 'Увеличить изображение', close: 'Закрыть'
    },
    en: {
      skip: 'Skip to content', login: 'Open the system', heroKicker: 'The whole ministry team in one system', heroTitle: 'From the first song to the final screen.', heroCopy: 'Worship Songs connects the leader, musicians, preacher, technician and congregation — without software installation or passing files around.', heroCta: 'Open Worship Songs', heroNote: 'Runs in a browser on desktop, tablet and phone', heroCaption: 'One choice by the leader updates the musicians’ sheet music, the hall lyrics and the streaming screen.',
      introLibrary: 'One library', introLibraryCopy: 'Songs, Bible, messages, sermons and media.', introRoles: 'Focused roles', introRolesCopy: 'Everyone sees only the tools they need.', introSync: 'Real-time sync', introSyncCopy: 'Hall, stream, sheet music and group phones.',
      scenariosEyebrow: 'Three scenarios', scenariosTitle: 'One system accompanies the entire service.', scenariosDeck: 'It does not replace people — it removes the gaps between their screens, materials and actions.', worshipTitle: 'Worship in the hall', worshipCopy: 'The leader builds the setlist and changes verses. Musicians receive sheet music or chords, while the technician controls lyrics, backgrounds, video and a separate streaming screen.', sermonTitle: 'Preparing and delivering a sermon', sermonCopy: 'The preacher prepares private notes and inserts Bible quotations, images, videos and slides. During the sermon, one tap sends the selected material to the screen.', groupTitle: 'A group inside or outside the building', groupCopy: 'Observers open songs, Bible translations and messages on a phone. In group mode, their screens passively follow the leader or technician.',
      tagSetlist: 'Setlist', tagNotes: 'Sheet music and chords', tagStream: 'Hall + stream', tagPrivate: 'Private notes', tagCitations: 'Live quotations', tagMedia: 'Slides and video', tagQr: 'QR access', tagLanguages: 'Multiple languages', tagFollow: 'Follow mode',
      rolesEyebrow: 'The team', rolesTitle: 'A focused workspace for every role.', rolesDeck: 'The interfaces share the current service state without loading users with tools they do not need.', roleLeader: 'Leader', roleLeaderCopy: 'Setlist, verses, sheet music and group broadcast.', roleMusician: 'Musician', roleMusicianCopy: 'Current song, selected image group and large sheet music.', rolePiano: 'Pianist', rolePianoCopy: 'A private song list that never affects shared screens.', roleObserver: 'Observer', roleObserverCopy: 'Songs, Bible, messages and history on a phone.', roleTech: 'Technician', roleTechCopy: 'Screens, text, translations, media and playlist.', rolePreacher: 'Preacher', rolePreacherCopy: 'Note editor and live material control while speaking.', roleAdmin: 'Administrator', roleAdminCopy: 'Users, collections, languages, screens and imports.', roleScreens: 'Screens', roleScreensCopy: 'Separate output for the hall and video stream.',
      uiEyebrow: 'Interface', uiTitle: 'Working interfaces, not demonstration mockups.', uiDeck: 'The system fits the task: a dense technical console on a large display and quick reading for a participant on a phone.', uiTech: 'Technical console', uiPrep: 'Sermon preparation', uiLeader: 'Leader', uiObserver: 'Observer', uiMobile: 'mobile',
      featuresEyebrow: 'Capabilities', featuresTitle: 'Everything that needs to work together.', featureLibrary: 'Materials', featureLibraryCopy: 'Full-text song search, content languages, Bible translations, messages and saved sermons.', featureBible: 'Parallel Bible', featureBibleCopy: 'Several translations on one screen with correct mapping where verse numbering differs.', featureMedia: 'Media', featureMediaCopy: 'Images, local video, YouTube, audio, wallpapers and video-position synchronization.', featureSermons: 'Sermons', featureSermonsCopy: 'Autosave, formatting, quotations, slides, draw.io import and material export.', featureChannels: 'Multiple channels', featureChannelsCopy: 'Main display, streaming display, a separate musician notes channel and the observer group channel.', featureAdmin: 'Management', featureAdminCopy: 'Roles and access, screen appearance, data import, Google sign-in and multi-community work.', closeTitle: 'The service stays human. The technology becomes clear.', closeCopy: 'Worship Songs runs in a browser and joins preparation, delivery and participation into one coordinated process.', closeCta: 'Open the system', footer: 'Worship service management system', zoom: 'Enlarge image', close: 'Close'
    },
    de: {
      skip: 'Zum Inhalt', login: 'System öffnen', heroKicker: 'Das gesamte Gottesdienstteam in einem System', heroTitle: 'Vom ersten Lied bis zum letzten Bildschirm.', heroCopy: 'Worship Songs verbindet Leitung, Musiker, Prediger, Technik und Gemeinde — ohne Installation und ohne Dateiversand.', heroCta: 'Worship Songs öffnen', heroNote: 'Läuft im Browser auf Computer, Tablet und Smartphone', heroCaption: 'Eine Auswahl der Leitung aktualisiert gleichzeitig Noten, Saaltext und Streaming-Bildschirm.',
      introLibrary: 'Eine Bibliothek', introLibraryCopy: 'Lieder, Bibel, Botschaften, Predigten und Medien.', introRoles: 'Klare Rollen', introRolesCopy: 'Jeder sieht nur die benötigten Werkzeuge.', introSync: 'Synchron in Echtzeit', introSyncCopy: 'Saal, Stream, Noten und Telefone der Gruppe.',
      scenariosEyebrow: 'Drei Szenarien', scenariosTitle: 'Ein System begleitet den ganzen Gottesdienst.', scenariosDeck: 'Es ersetzt keine Menschen — es schließt die Lücken zwischen Bildschirmen, Materialien und Handlungen.', worshipTitle: 'Lobpreis im Saal', worshipCopy: 'Die Leitung erstellt die Liedfolge und wechselt Strophen. Musiker erhalten Noten oder Akkorde; die Technik steuert Text, Hintergrund, Video und den separaten Streaming-Bildschirm.', sermonTitle: 'Predigt vorbereiten und halten', sermonCopy: 'Der Prediger erstellt private Notizen und fügt Bibelzitate, Bilder, Videos und Folien ein. Während der Predigt bringt eine Berührung das gewählte Material auf den Bildschirm.', groupTitle: 'Gruppe im Saal und unterwegs', groupCopy: 'Beobachter öffnen Lieder, Bibelübersetzungen und Botschaften auf dem Smartphone. Im Gruppenmodus folgen ihre Bildschirme passiv der Leitung oder Technik.',
      tagSetlist: 'Liedfolge', tagNotes: 'Noten und Akkorde', tagStream: 'Saal + Stream', tagPrivate: 'Private Notizen', tagCitations: 'Interaktive Zitate', tagMedia: 'Folien und Video', tagQr: 'Zugang per QR', tagLanguages: 'Mehrere Sprachen', tagFollow: 'Folgemodus',
      rolesEyebrow: 'Das Team', rolesTitle: 'Ein eigener Arbeitsbereich für jede Rolle.', rolesDeck: 'Alle Oberflächen teilen den aktuellen Gottesdienstzustand, ohne unnötige Funktionen zu zeigen.', roleLeader: 'Leitung', roleLeaderCopy: 'Liedfolge, Strophen, Noten und Gruppensendung.', roleMusician: 'Musiker', roleMusicianCopy: 'Aktuelles Lied, Bildgruppe und große Noten.', rolePiano: 'Pianist', rolePianoCopy: 'Private Liedliste ohne Einfluss auf gemeinsame Bildschirme.', roleObserver: 'Beobachter', roleObserverCopy: 'Lieder, Bibel, Botschaften und Verlauf am Smartphone.', roleTech: 'Technik', roleTechCopy: 'Bildschirme, Texte, Übersetzungen, Medien und Playlist.', rolePreacher: 'Prediger', rolePreacherCopy: 'Notizeditor und Materialsteuerung während der Predigt.', roleAdmin: 'Administrator', roleAdminCopy: 'Benutzer, Sammlungen, Sprachen, Bildschirme und Import.', roleScreens: 'Bildschirme', roleScreensCopy: 'Getrennte Ausgabe für Saal und Videostream.',
      uiEyebrow: 'Oberfläche', uiTitle: 'Echte Arbeitsfenster statt Demo-Mockups.', uiDeck: 'Das System passt zur Aufgabe: ein dichter Technikpult auf dem großen Bildschirm und schnelles Lesen auf dem Smartphone.', uiTech: 'Technischer Modus', uiPrep: 'Predigtvorbereitung', uiLeader: 'Leitung', uiObserver: 'Beobachter', uiMobile: 'mobil',
      featuresEyebrow: 'Funktionen', featuresTitle: 'Alles, was zusammenarbeiten muss.', featureLibrary: 'Materialien', featureLibraryCopy: 'Volltextsuche, Inhaltssprachen, Bibelübersetzungen, Botschaften und gespeicherte Predigten.', featureBible: 'Parallele Bibel', featureBibleCopy: 'Mehrere Übersetzungen auf einem Bildschirm mit korrekter Zuordnung abweichender Versnummerierung.', featureMedia: 'Medien', featureMediaCopy: 'Bilder, lokale Videos, YouTube, Audio, Hintergründe und Synchronisierung der Videoposition.', featureSermons: 'Predigten', featureSermonsCopy: 'Automatisches Speichern, Formatierung, Zitate, Folien, draw.io-Import und Export.', featureChannels: 'Mehrere Kanäle', featureChannelsCopy: 'Saalbildschirm, Streaming-Bildschirm, separater Notenkanal und Beobachterkanal.', featureAdmin: 'Verwaltung', featureAdminCopy: 'Rollen, Zugänge, Bildschirmgestaltung, Datenimport, Google-Anmeldung und mehrere Gemeinden.', closeTitle: 'Der Gottesdienst bleibt lebendig. Die Technik wird verständlich.', closeCopy: 'Worship Songs läuft im Browser und verbindet Vorbereitung, Durchführung und Teilnahme zu einem abgestimmten Prozess.', closeCta: 'System öffnen', footer: 'System zur Gottesdienstverwaltung', zoom: 'Bild vergrößern', close: 'Schließen'
    },
    lt: {
      skip: 'Pereiti prie turinio', login: 'Atidaryti sistemą', heroKicker: 'Visa tarnavimo komanda vienoje sistemoje', heroTitle: 'Nuo pirmos giesmės iki paskutinio ekrano.', heroCopy: 'Worship Songs sujungia vadovą, muzikantus, pamokslininką, techniką ir bendruomenę — be programų diegimo ir failų siuntinėjimo.', heroCta: 'Atidaryti Worship Songs', heroNote: 'Veikia naršyklėje kompiuteryje, planšetėje ir telefone', heroCaption: 'Vienas vadovo pasirinkimas vienu metu atnaujina muzikantų natas, žodžius salėje ir transliacijos ekraną.',
      introLibrary: 'Bendra biblioteka', introLibraryCopy: 'Giesmės, Biblija, žinios, pamokslai ir medija.', introRoles: 'Aiškios rolės', introRolesCopy: 'Kiekvienas mato tik jam reikalingus įrankius.', introSync: 'Sinchroniškai realiu laiku', introSyncCopy: 'Salė, transliacija, natos ir grupės telefonai.',
      scenariosEyebrow: 'Trys scenarijai', scenariosTitle: 'Viena sistema lydi visas pamaldas.', scenariosDeck: 'Ji nepakeičia žmonių — ji pašalina tarpus tarp jų ekranų, medžiagos ir veiksmų.', worshipTitle: 'Šlovinimas salėje', worshipCopy: 'Vadovas sudaro giesmių eilę ir perjungia posmus. Muzikantai gauna natas ar akordus, o technikas valdo žodžius, foną, vaizdo įrašus ir atskirą transliacijos ekraną.', sermonTitle: 'Pamokslo ruošimas ir sakymas', sermonCopy: 'Pamokslininkas ruošia asmeninius užrašus, įterpia Biblijos citatas, vaizdus, vaizdo įrašus ir skaidres. Pamokslo metu vienas palietimas parodo pasirinktą medžiagą ekrane.', groupTitle: 'Grupė salėje ir už jos ribų', groupCopy: 'Stebėtojai telefone atidaro giesmes, Biblijos vertimus ir žinias. Grupės režimu jų ekranai pasyviai seka vadovą arba techniką.',
      tagSetlist: 'Giesmių eilė', tagNotes: 'Natos ir akordai', tagStream: 'Salė + transliacija', tagPrivate: 'Asmeniniai užrašai', tagCitations: 'Interaktyvios citatos', tagMedia: 'Skaidrės ir vaizdas', tagQr: 'Prisijungimas per QR', tagLanguages: 'Kelios kalbos', tagFollow: 'Sekimo režimas',
      rolesEyebrow: 'Komanda', rolesTitle: 'Kiekvienai rolei — sava darbo erdvė.', rolesDeck: 'Sąsajos dalijasi pamaldų būsena, bet nerodo nereikalingų funkcijų.', roleLeader: 'Vadovas', roleLeaderCopy: 'Giesmių eilė, posmai, natos ir transliacija grupei.', roleMusician: 'Muzikantas', roleMusicianCopy: 'Dabartinė giesmė, pasirinkta vaizdų grupė ir didelės natos.', rolePiano: 'Pianistas', rolePianoCopy: 'Asmeninis giesmių sąrašas, neveikiantis bendrų ekranų.', roleObserver: 'Stebėtojas', roleObserverCopy: 'Giesmės, Biblija, žinios ir istorija telefone.', roleTech: 'Technikas', roleTechCopy: 'Ekranai, tekstai, vertimai, medija ir grojaraštis.', rolePreacher: 'Pamokslininkas', rolePreacherCopy: 'Užrašų redaktorius ir medžiagos valdymas kalbant.', roleAdmin: 'Administratorius', roleAdminCopy: 'Naudotojai, rinkiniai, kalbos, ekranai ir importas.', roleScreens: 'Ekranai', roleScreensCopy: 'Atskiras vaizdas salei ir vaizdo transliacijai.',
      uiEyebrow: 'Sąsaja', uiTitle: 'Tikri darbo langai, ne demonstraciniai maketai.', uiDeck: 'Sistema prisitaiko prie užduoties: tankus techninis pultas dideliame ekrane ir greitas skaitymas telefone.', uiTech: 'Techninis režimas', uiPrep: 'Pamokslo ruošimas', uiLeader: 'Vadovas', uiObserver: 'Stebėtojas', uiMobile: 'mobilus',
      featuresEyebrow: 'Galimybės', featuresTitle: 'Viskas, kas turi veikti kartu.', featureLibrary: 'Medžiaga', featureLibraryCopy: 'Pilno teksto paieška, turinio kalbos, Biblijos vertimai, žinios ir išsaugoti pamokslai.', featureBible: 'Lygiagreti Biblija', featureBibleCopy: 'Keli vertimai viename ekrane su teisingu skirtingos eilučių numeracijos susiejimu.', featureMedia: 'Medija', featureMediaCopy: 'Vaizdai, vietiniai vaizdo įrašai, YouTube, garsas, fonai ir vaizdo pozicijos sinchronizavimas.', featureSermons: 'Pamokslai', featureSermonsCopy: 'Automatinis išsaugojimas, formatavimas, citatos, skaidrės, draw.io importas ir eksportas.', featureChannels: 'Keli kanalai', featureChannelsCopy: 'Salės ekranas, transliacijos ekranas, atskiras natų kanalas ir stebėtojų grupės kanalas.', featureAdmin: 'Valdymas', featureAdminCopy: 'Rolės, prieigos, ekranų išvaizda, duomenų importas, Google prisijungimas ir kelios bendruomenės.', closeTitle: 'Pamaldos lieka gyvos. Technika tampa suprantama.', closeCopy: 'Worship Songs veikia naršyklėje ir sujungia ruošimą, vedimą bei dalyvavimą į vieną suderintą procesą.', closeCta: 'Atidaryti sistemą', footer: 'Pamaldų valdymo sistema', zoom: 'Padidinti vaizdą', close: 'Uždaryti'
    },
    pl: {
      skip: 'Przejdź do treści', login: 'Otwórz system', heroKicker: 'Cały zespół służby w jednym systemie', heroTitle: 'Od pierwszej pieśni do ostatniego ekranu.', heroCopy: 'Worship Songs łączy prowadzącego, muzyków, kaznodzieję, technika i wspólnotę — bez instalowania programów i przesyłania plików.', heroCta: 'Otwórz Worship Songs', heroNote: 'Działa w przeglądarce na komputerze, tablecie i telefonie', heroCaption: 'Jeden wybór prowadzącego aktualizuje nuty muzyków, tekst w sali i ekran transmisji.',
      introLibrary: 'Wspólna biblioteka', introLibraryCopy: 'Pieśni, Biblia, przesłania, kazania i media.', introRoles: 'Jasne role', introRolesCopy: 'Każdy widzi tylko potrzebne narzędzia.', introSync: 'Synchronizacja na żywo', introSyncCopy: 'Sala, transmisja, nuty i telefony grupy.',
      scenariosEyebrow: 'Trzy scenariusze', scenariosTitle: 'Jeden system wspiera całe nabożeństwo.', scenariosDeck: 'Nie zastępuje ludzi — usuwa przerwy między ich ekranami, materiałami i działaniami.', worshipTitle: 'Uwielbienie w sali', worshipCopy: 'Prowadzący układa kolejność pieśni i zmienia zwrotki. Muzycy otrzymują nuty lub akordy, a technik steruje tekstem, tłem, wideo i osobnym ekranem transmisji.', sermonTitle: 'Przygotowanie i prowadzenie kazania', sermonCopy: 'Kaznodzieja przygotowuje prywatne notatki oraz dodaje cytaty biblijne, obrazy, wideo i slajdy. Podczas kazania jedno dotknięcie wysyła wybrany materiał na ekran.', groupTitle: 'Grupa w sali i poza nią', groupCopy: 'Obserwatorzy otwierają na telefonie pieśni, przekłady Biblii i przesłania. W trybie grupowym ich ekrany biernie podążają za prowadzącym lub technikiem.',
      tagSetlist: 'Kolejność pieśni', tagNotes: 'Nuty i akordy', tagStream: 'Sala + transmisja', tagPrivate: 'Prywatne notatki', tagCitations: 'Aktywne cytaty', tagMedia: 'Slajdy i wideo', tagQr: 'Dostęp przez QR', tagLanguages: 'Wiele języków', tagFollow: 'Tryb śledzenia',
      rolesEyebrow: 'Zespół', rolesTitle: 'Osobne miejsce pracy dla każdej roli.', rolesDeck: 'Interfejsy współdzielą stan nabożeństwa, ale nie pokazują zbędnych funkcji.', roleLeader: 'Prowadzący', roleLeaderCopy: 'Kolejność pieśni, zwrotki, nuty i transmisja do grupy.', roleMusician: 'Muzyk', roleMusicianCopy: 'Bieżąca pieśń, wybrana grupa obrazów i duże nuty.', rolePiano: 'Pianista', rolePianoCopy: 'Prywatna lista pieśni bez wpływu na wspólne ekrany.', roleObserver: 'Obserwator', roleObserverCopy: 'Pieśni, Biblia, przesłania i historia w telefonie.', roleTech: 'Technik', roleTechCopy: 'Ekrany, teksty, przekłady, media i lista odtwarzania.', rolePreacher: 'Kaznodzieja', rolePreacherCopy: 'Edytor notatek i sterowanie materiałem podczas mówienia.', roleAdmin: 'Administrator', roleAdminCopy: 'Użytkownicy, zbiory, języki, ekrany i import.', roleScreens: 'Ekrany', roleScreensCopy: 'Oddzielny obraz dla sali i transmisji wideo.',
      uiEyebrow: 'Interfejs', uiTitle: 'Prawdziwe okna pracy, nie demonstracyjne makiety.', uiDeck: 'System dopasowuje się do zadania: rozbudowany pulpit technika na dużym ekranie i szybki podgląd na telefonie.', uiTech: 'Tryb techniczny', uiPrep: 'Przygotowanie kazania', uiLeader: 'Prowadzący', uiObserver: 'Obserwator', uiMobile: 'mobilny',
      featuresEyebrow: 'Możliwości', featuresTitle: 'Wszystko, co powinno działać razem.', featureLibrary: 'Materiały', featureLibraryCopy: 'Wyszukiwanie pełnotekstowe, języki treści, przekłady Biblii, przesłania i zapisane kazania.', featureBible: 'Biblia równoległa', featureBibleCopy: 'Kilka przekładów na jednym ekranie z prawidłowym mapowaniem różnej numeracji wersetów.', featureMedia: 'Media', featureMediaCopy: 'Obrazy, lokalne wideo, YouTube, audio, tła i synchronizacja pozycji filmu.', featureSermons: 'Kazania', featureSermonsCopy: 'Autozapis, formatowanie, cytaty, slajdy, import draw.io i eksport materiałów.', featureChannels: 'Wiele kanałów', featureChannelsCopy: 'Ekran sali, ekran transmisji, osobny kanał nut dla muzyków i kanał grupy obserwatorów.', featureAdmin: 'Zarządzanie', featureAdminCopy: 'Role, dostępy, wygląd ekranów, import danych, logowanie Google i współpraca wspólnot.', closeTitle: 'Nabożeństwo pozostaje żywe. Technika staje się zrozumiała.', closeCopy: 'Worship Songs działa w przeglądarce i łączy przygotowanie, prowadzenie oraz uczestnictwo w jeden spójny proces.', closeCta: 'Otwórz system', footer: 'System zarządzania nabożeństwem', zoom: 'Powiększ obraz', close: 'Zamknij'
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
      introLibraryCopy: 'Песни, ноты, переводы Библии, послания и проповеди.',
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
      heroKicker: 'A noncommercial project for churches',
      heroTitle: 'Songs, texts and screens for church teams.',
      heroCopy: 'Worship Songs was built to help other churches prepare and hold services. Leaders, musicians, preachers and technicians work with shared materials.',
      heroCaption: 'The leader selects a song. Its verses appear for the technician, and musicians see sheet music.',
      introLibrary: 'Materials in one place', introLibraryCopy: 'Songs, sheet music, Bible translations, messages and sermons.',
      introRoles: 'Tools for each role', introRolesCopy: 'Every participant has a workspace for their task.',
      introSync: 'Updates without file sharing', introSyncCopy: 'The selected song and its verses appear for the technician.',
      scenariosTitle: 'How the system helps during a service',
      scenariosDeck: 'Three common tasks: managing songs, delivering a sermon and reading text on a phone.',
      worshipCopy: 'The leader prepares the setlist and selects a song. Its verses appear on the technician’s computer; the technician normally advances them on the screens. The leader can also switch verses when needed. Musicians see sheet music or chords.',
      roleLeaderCopy: 'Song selection, sheet music and optional verse control.',
      rolesTitle: 'A mode for each participant', rolesDeck: 'Available actions depend on the participant’s task during the service.',
      uiTitle: 'Actual working screens', uiDeck: 'Screenshots from the current system: technical console, sermon editor and phone views.',
      featuresTitle: 'Other capabilities',
      closeTitle: 'If this would help your church, get in touch.',
      closeCopy: 'This is a noncommercial project. You can request access for your church on the sign-in page.'
    },
    de: {
      heroKicker: 'Ein nicht kommerzielles Projekt für Gemeinden',
      heroTitle: 'Lieder, Texte und Bildschirme für Gemeindeteams.',
      heroCopy: 'Worship Songs wurde entwickelt, um anderen Gemeinden bei der Vorbereitung und Durchführung von Gottesdiensten zu helfen. Leitung, Musiker, Prediger und Technik nutzen gemeinsame Materialien.',
      heroCaption: 'Die Leitung wählt ein Lied. Die Strophen erscheinen bei der Technik, die Noten bei den Musikern.',
      introLibrary: 'Materialien an einem Ort', introLibraryCopy: 'Lieder, Noten, Bibelübersetzungen, Botschaften und Predigten.',
      introRoles: 'Werkzeuge je nach Aufgabe', introRolesCopy: 'Jeder Beteiligte hat einen passenden Arbeitsbereich.',
      introSync: 'Aktualisierungen ohne Dateiversand', introSyncCopy: 'Das gewählte Lied und seine Strophen erscheinen bei der Technik.',
      scenariosTitle: 'So hilft das System im Gottesdienst',
      scenariosDeck: 'Drei typische Aufgaben: Lieder verwalten, eine Predigt halten und Texte am Smartphone lesen.',
      worshipCopy: 'Die Leitung stellt die Liedfolge zusammen und wählt ein Lied. Dessen Strophen erscheinen am Computer der Technik, die sie normalerweise auf den Bildschirmen weiterschaltet. Bei Bedarf kann die Leitung die Strophen selbst wechseln. Musiker sehen Noten oder Akkorde.',
      roleLeaderCopy: 'Liedauswahl, Noten und bei Bedarf eigene Strophensteuerung.',
      rolesTitle: 'Ein Modus für jeden Beteiligten', rolesDeck: 'Die verfügbaren Funktionen richten sich nach der Aufgabe im Gottesdienst.',
      uiTitle: 'Echte Arbeitsansichten', uiDeck: 'Aufnahmen des aktuellen Systems: Technikpult, Predigteditor und Smartphone-Ansichten.',
      featuresTitle: 'Weitere Funktionen',
      closeTitle: 'Wenn das Ihrer Gemeinde hilft, melden Sie sich.',
      closeCopy: 'Das Projekt ist nicht kommerziell. Auf der Anmeldeseite können Sie Zugang für Ihre Gemeinde anfragen.'
    },
    lt: {
      heroKicker: 'Nekomercinis projektas bažnyčioms',
      heroTitle: 'Giesmės, tekstai ir ekranai bažnyčios komandai.',
      heroCopy: 'Worship Songs sukurta padėti kitoms bažnyčioms ruoštis pamaldoms ir jas vesti. Vadovai, muzikantai, pamokslininkai ir technikai naudoja bendrą medžiagą.',
      heroCaption: 'Vadovas pasirenka giesmę. Jos posmai rodomi technikui, o natos — muzikantams.',
      introLibrary: 'Medžiaga vienoje vietoje', introLibraryCopy: 'Giesmės, natos, Biblijos vertimai, žinios ir pamokslai.',
      introRoles: 'Įrankiai pagal vaidmenį', introRolesCopy: 'Kiekvienas dalyvis turi savo darbo erdvę.',
      introSync: 'Atnaujinimai be failų siuntimo', introSyncCopy: 'Pasirinkta giesmė ir jos posmai matomi technikui.',
      scenariosTitle: 'Kaip sistema padeda per pamaldas',
      scenariosDeck: 'Trys įprastos užduotys: giesmės, pamokslas ir tekstų skaitymas telefone.',
      worshipCopy: 'Vadovas sudaro giesmių sąrašą ir pasirenka giesmę. Jos posmai atsiranda techniko kompiuteryje; paprastai technikas juos perjungia ekranuose. Prireikus posmus gali perjungti ir pats vadovas. Muzikantai mato natas arba akordus.',
      roleLeaderCopy: 'Giesmių pasirinkimas, natos ir galimybė pačiam perjungti posmus.',
      rolesTitle: 'Režimas kiekvienam dalyviui', rolesDeck: 'Galimi veiksmai priklauso nuo žmogaus užduoties per pamaldas.',
      uiTitle: 'Tikri darbo ekranai', uiDeck: 'Dabartinės sistemos vaizdai: techninis pultas, pamokslo redaktorius ir telefono puslapiai.',
      featuresTitle: 'Kitos galimybės',
      closeTitle: 'Jei tai naudinga jūsų bažnyčiai, susisiekite.',
      closeCopy: 'Tai nekomercinis projektas. Prisijungimo puslapyje galima paprašyti prieigos savo bažnyčiai.'
    },
    pl: {
      heroKicker: 'Niekomercyjny projekt dla kościołów',
      heroTitle: 'Pieśni, teksty i ekrany dla zespołu kościelnego.',
      heroCopy: 'Worship Songs powstał, aby pomagać innym kościołom przygotowywać i prowadzić nabożeństwa. Prowadzący, muzycy, kaznodzieje i technicy korzystają ze wspólnych materiałów.',
      heroCaption: 'Prowadzący wybiera pieśń. Jej zwrotki widzi technik, a nuty — muzycy.',
      introLibrary: 'Materiały w jednym miejscu', introLibraryCopy: 'Pieśni, nuty, przekłady Biblii, przesłania i kazania.',
      introRoles: 'Narzędzia według roli', introRolesCopy: 'Każdy uczestnik ma własny widok do swojej pracy.',
      introSync: 'Aktualizacje bez wysyłania plików', introSyncCopy: 'Wybrana pieśń i jej zwrotki są widoczne dla technika.',
      scenariosTitle: 'Jak system pomaga podczas nabożeństwa',
      scenariosDeck: 'Trzy codzienne zadania: pieśni, kazanie i czytanie tekstów na telefonie.',
      worshipCopy: 'Prowadzący układa kolejność pieśni i wybiera pieśń. Jej zwrotki pojawiają się na komputerze technika, który zwykle przełącza je na ekranach. W razie potrzeby prowadzący może przełączać zwrotki sam. Muzycy widzą nuty lub akordy.',
      roleLeaderCopy: 'Wybór pieśni, nuty i możliwość samodzielnego przełączania zwrotek.',
      rolesTitle: 'Tryb dla każdego uczestnika', rolesDeck: 'Dostępne działania zależą od zadania danej osoby podczas nabożeństwa.',
      uiTitle: 'Prawdziwe ekrany pracy', uiDeck: 'Zrzuty bieżącego systemu: pulpit technika, edytor kazania i widoki telefonu.',
      featuresTitle: 'Pozostałe możliwości',
      closeTitle: 'Jeśli to przyda się waszemu kościołowi, skontaktujcie się.',
      closeCopy: 'To projekt niekomercyjny. Na stronie logowania można poprosić o dostęp dla swojego kościoła.'
    }
  };
  Object.keys(PLAIN_COPY).forEach(function (lang) {
    Object.keys(PLAIN_COPY[lang]).forEach(function (key) {
      COPY[lang][key] = PLAIN_COPY[lang][key];
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
