"use strict";
export const createLocalizationMap = (strings) => {
  const map = {};
  if (strings.de) map.de = strings.de;
  if (strings.es) map["es-ES"] = strings.es;
  if (strings.fr) map.fr = strings.fr;
  return map;
};
export const commandNames = {
  ping: {
    en: "ping",
    de: "ping",
    es: "ping",
    fr: "ping"
  },
  warn: {
    en: "warn",
    de: "warnen",
    es: "advertir",
    fr: "avertir"
  },
  moderation: {
    en: "moderation",
    de: "moderation",
    es: "moderacion",
    fr: "moderation"
  },
  config: {
    en: "config",
    de: "konfiguration",
    es: "configuracion",
    fr: "configuration"
  },
  giveaway: {
    en: "gw",
    de: "gewinnspiel",
    es: "sorteo",
    fr: "concours"
  },
  economy: {
    en: "eco",
    de: "wirtschaft",
    es: "economia",
    fr: "economie"
  },
  xp: {
    en: "xp",
    de: "xp",
    es: "xp",
    fr: "xp"
  },
  ticket: {
    en: "ticket",
    de: "ticket",
    es: "ticket",
    fr: "ticket"
  },
  language: {
    en: "language",
    de: "sprache",
    es: "idioma",
    fr: "langue"
  },
  utils: {
    en: "utils",
    de: "werkzeuge",
    es: "utilidades",
    fr: "utilitaires"
  },
  blacklist: {
    en: "blacklist",
    de: "sperrliste",
    es: "listanegra",
    fr: "listenoire"
  },
  fun: {
    en: "fun",
    de: "spass",
    es: "diversion",
    fr: "amusant"
  }
};
export const commandDescriptions = {
  ping: {
    en: "Check bot latency",
    de: "\xDCberpr\xFCfe die Latenz des Bots",
    es: "Comprueba la latencia del bot",
    fr: "V\xE9rifier la latence du bot"
  },
  warn: {
    en: "Manage user warnings",
    de: "Benutzerwarnungen verwalten",
    es: "Gestionar advertencias de usuario",
    fr: "G\xE9rer les avertissements utilisateur"
  },
  moderation: {
    en: "Moderation commands for server management",
    de: "Moderationsbefehle f\xFCr die Serververwaltung",
    es: "Comandos de moderaci\xF3n para la gesti\xF3n del servidor",
    fr: "Commandes de mod\xE9ration pour la gestion du serveur"
  },
  config: {
    en: "Configure bot settings for your server",
    de: "Bot-Einstellungen f\xFCr Ihren Server konfigurieren",
    es: "Configurar ajustes del bot para tu servidor",
    fr: "Configurer les param\xE8tres du bot pour votre serveur"
  },
  giveaway: {
    en: "Manage giveaways on your server",
    de: "Gewinnspiele auf Ihrem Server verwalten",
    es: "Gestionar sorteos en tu servidor",
    fr: "G\xE9rer les concours sur votre serveur"
  },
  economy: {
    en: "Economy system commands",
    de: "Wirtschaftssystem-Befehle",
    es: "Comandos del sistema econ\xF3mico",
    fr: "Commandes du syst\xE8me \xE9conomique"
  },
  xp: {
    en: "XP and leveling system",
    de: "XP- und Levelsystem",
    es: "Sistema de XP y niveles",
    fr: "Syst\xE8me XP et de niveaux"
  },
  ticket: {
    en: "Support ticket system",
    de: "Support-Ticket-System",
    es: "Sistema de tickets de soporte",
    fr: "Syst\xE8me de tickets de support"
  },
  language: {
    en: "Language preferences",
    de: "Spracheinstellungen",
    es: "Preferencias de idioma",
    fr: "Pr\xE9f\xE9rences linguistiques"
  },
  utils: {
    en: "Utility commands",
    de: "N\xFCtzliche Befehle",
    es: "Comandos de utilidad",
    fr: "Commandes utilitaires"
  },
  blacklist: {
    en: "Manage bot blacklist",
    de: "Bot-Sperrliste verwalten",
    es: "Gestionar lista negra del bot",
    fr: "G\xE9rer la liste noire du bot"
  },
  fun: {
    en: "Fun and entertainment commands",
    de: "Spa\xDF- und Unterhaltungsbefehle",
    es: "Comandos de diversi\xF3n y entretenimiento",
    fr: "Commandes amusantes et de divertissement"
  }
};
export const subcommandDescriptions = {
  xp: {
    rank: {
      en: "View your XP rank card",
      de: "Deine XP-Rangkarte anzeigen",
      es: "Ver tu tarjeta de rango XP",
      fr: "Voir votre carte de rang XP"
    },
    leaderboard: {
      en: "View the server XP leaderboard",
      de: "Die Server-XP-Bestenliste anzeigen",
      es: "Ver la tabla de clasificaci\xF3n de XP del servidor",
      fr: "Voir le classement XP du serveur"
    },
    configuration: {
      en: "View current XP configuration",
      de: "Aktuelle XP-Konfiguration anzeigen",
      es: "Ver la configuraci\xF3n actual de XP",
      fr: "Voir la configuration XP actuelle"
    },
    card: {
      en: "Customize your rank card colors",
      de: "Farben deiner Rangkarte anpassen",
      es: "Personalizar los colores de tu tarjeta de rango",
      fr: "Personnaliser les couleurs de votre carte de rang"
    }
  },
  utils: {
    avatar: {
      en: "Get a user's avatar",
      de: "Avatar eines Benutzers abrufen",
      es: "Obtener el avatar de un usuario",
      fr: "Obtenir l'avatar d'un utilisateur"
    },
    banner: {
      en: "Get a user's banner",
      de: "Banner eines Benutzers abrufen",
      es: "Obtener el banner de un usuario",
      fr: "Obtenir la banni\xE8re d'un utilisateur"
    },
    steam: {
      en: "Get Steam profile information",
      de: "Steam-Profilinformationen abrufen",
      es: "Obtener informaci\xF3n del perfil de Steam",
      fr: "Obtenir les informations du profil Steam"
    },
    userinfo: {
      en: "Get detailed user information",
      de: "Detaillierte Benutzerinformationen abrufen",
      es: "Obtener informaci\xF3n detallada del usuario",
      fr: "Obtenir des informations d\xE9taill\xE9es sur l'utilisateur"
    },
    whois: {
      en: "Look up user by ID",
      de: "Benutzer nach ID suchen",
      es: "Buscar usuario por ID",
      fr: "Rechercher un utilisateur par ID"
    },
    roleinfo: {
      en: "Get role information",
      de: "Rolleninformationen abrufen",
      es: "Obtener informaci\xF3n del rol",
      fr: "Obtenir des informations sur le r\xF4le"
    },
    serverinfo: {
      en: "Get server information",
      de: "Serverinformationen abrufen",
      es: "Obtener informaci\xF3n del servidor",
      fr: "Obtenir des informations sur le serveur"
    },
    help: {
      en: "Get help for commands",
      de: "Hilfe zu Befehlen erhalten",
      es: "Obtener ayuda para los comandos",
      fr: "Obtenir de l'aide pour les commandes"
    },
    support: {
      en: "Get support server link",
      de: "Support-Server-Link erhalten",
      es: "Obtener enlace del servidor de soporte",
      fr: "Obtenir le lien du serveur de support"
    },
    stats: {
      en: "View bot statistics and system information",
      de: "Bot-Statistiken und Systeminformationen anzeigen",
      es: "Ver estad\xEDsticas del bot e informaci\xF3n del sistema",
      fr: "Voir les statistiques du bot et les informations syst\xE8me"
    }
  },
  language: {
    available: {
      en: "List available languages",
      de: "Verf\xFCgbare Sprachen auflisten",
      es: "Listar idiomas disponibles",
      fr: "Lister les langues disponibles"
    },
    current: {
      en: "Show current language",
      de: "Aktuelle Sprache anzeigen",
      es: "Mostrar idioma actual",
      fr: "Afficher la langue actuelle"
    },
    set: {
      en: "Set preferred language",
      de: "Bevorzugte Sprache festlegen",
      es: "Establecer idioma preferido",
      fr: "D\xE9finir la langue pr\xE9f\xE9r\xE9e"
    }
  },
  ticket: {
    panel: {
      group: {
        en: "Manage ticket panels",
        de: "Ticket-Panels verwalten",
        es: "Gestionar paneles de tickets",
        fr: "G\xE9rer les panneaux de tickets"
      },
      create: {
        en: "Create a new ticket panel configuration",
        de: "Eine neue Ticket-Panel-Konfiguration erstellen",
        es: "Crear una nueva configuraci\xF3n de panel de tickets",
        fr: "Cr\xE9er une nouvelle configuration de panneau de tickets"
      },
      load: {
        en: "Load and send a ticket panel",
        de: "Ein Ticket-Panel laden und senden",
        es: "Cargar y enviar un panel de tickets",
        fr: "Charger et envoyer un panneau de tickets"
      },
      delete: {
        en: "Delete a ticket panel",
        de: "Ein Ticket-Panel l\xF6schen",
        es: "Eliminar un panel de tickets",
        fr: "Supprimer un panneau de tickets"
      },
      list: {
        en: "List all ticket panels in this server",
        de: "Alle Ticket-Panels auf diesem Server auflisten",
        es: "Listar todos los paneles de tickets en este servidor",
        fr: "Lister tous les panneaux de tickets de ce serveur"
      },
      edit: {
        en: "Edit an existing ticket panel",
        de: "Ein bestehendes Ticket-Panel bearbeiten",
        es: "Editar un panel de tickets existente",
        fr: "Modifier un panneau de tickets existant"
      },
      add_dept: {
        en: "Add a department to a ticket panel",
        de: "Eine Abteilung zu einem Ticket-Panel hinzuf\xFCgen",
        es: "A\xF1adir un departamento a un panel de tickets",
        fr: "Ajouter un d\xE9partement \xE0 un panneau de tickets"
      },
      list_depts: {
        en: "List all departments for a ticket panel",
        de: "Alle Abteilungen f\xFCr ein Ticket-Panel auflisten",
        es: "Listar todos los departamentos de un panel de tickets",
        fr: "Lister tous les d\xE9partements pour un panneau de tickets"
      },
      remove_dept: {
        en: "Remove a department from a ticket panel",
        de: "Eine Abteilung aus einem Ticket-Panel entfernen",
        es: "Eliminar un departamento de un panel de tickets",
        fr: "Supprimer un d\xE9partement d'un panneau de tickets"
      }
    },
    claim: {
      en: "Claim a ticket (for support staff)",
      de: "Ein Ticket beanspruchen (f\xFCr Support-Mitarbeiter)",
      es: "Reclamar un ticket (para personal de soporte)",
      fr: "R\xE9clamer un ticket (pour le personnel de support)"
    },
    close: {
      en: "Close a ticket",
      de: "Ein Ticket schlie\xDFen",
      es: "Cerrar un ticket",
      fr: "Fermer un ticket"
    }
  },
  fun: {
    meme: {
      en: "Get a random meme",
      de: "Ein zuf\xE4lliges Meme erhalten",
      es: "Obtener un meme aleatorio",
      fr: "Obtenir un m\xE8me al\xE9atoire"
    },
    fact: {
      en: "Get a random fact",
      de: "Eine zuf\xE4llige Tatsache erhalten",
      es: "Obtener un dato aleatorio",
      fr: "Obtenir un fait al\xE9atoire"
    },
    quote: {
      en: "Get a random quote",
      de: "Ein zuf\xE4lliges Zitat erhalten",
      es: "Obtener una cita aleatoria",
      fr: "Obtenir une citation al\xE9atoire"
    },
    joke: {
      en: "Get a random joke",
      de: "Einen zuf\xE4lligen Witz erhalten",
      es: "Obtener un chiste aleatorio",
      fr: "Obtenir une blague al\xE9atoire"
    },
    dadjoke: {
      en: "Get a random dad joke",
      de: "Einen zuf\xE4lligen Dad-Joke erhalten",
      es: "Obtener un chiste de pap\xE1 aleatorio",
      fr: "Obtenir une blague de papa al\xE9atoire"
    }
  },
  warn: {
    create: {
      en: "Issue a warning to a user",
      de: "Eine Warnung an einen Benutzer ausgeben",
      es: "Emitir una advertencia a un usuario",
      fr: "\xC9mettre un avertissement \xE0 un utilisateur"
    },
    edit: {
      en: "Edit an existing warning",
      de: "Eine bestehende Warnung bearbeiten",
      es: "Editar una advertencia existente",
      fr: "Modifier un avertissement existant"
    },
    lookup: {
      en: "Look up a specific warning",
      de: "Eine bestimmte Warnung nachschlagen",
      es: "Buscar una advertencia espec\xEDfica",
      fr: "Rechercher un avertissement sp\xE9cifique"
    },
    view: {
      en: "View all warnings for a user",
      de: "Alle Warnungen f\xFCr einen Benutzer anzeigen",
      es: "Ver todas las advertencias de un usuario",
      fr: "Voir tous les avertissements pour un utilisateur"
    },
    purge: {
      en: "Remove all warnings for a user",
      de: "Alle Warnungen eines Benutzers entfernen",
      es: "Eliminar todas las advertencias de un usuario",
      fr: "Supprimer tous les avertissements d\u2019un utilisateur"
    },
    delete: {
      en: "Delete a warning by ID",
      de: "Eine Warnung anhand der ID l\xF6schen",
      es: "Eliminar una advertencia por ID",
      fr: "Supprimer un avertissement par identifiant"
    },
    automation: {
      group: {
        en: "Manage warning automations",
        de: "Warnungsautomatisierungen verwalten",
        es: "Gestionar automatizaciones de advertencia",
        fr: "G\xE9rer les automatisations d'avertissement"
      },
      create: {
        en: "Create a warning automation",
        de: "Eine Warnungsautomatisierung erstellen",
        es: "Crear una automatizaci\xF3n de advertencia",
        fr: "Cr\xE9er une automatisation d'avertissement"
      },
      view: {
        en: "View all warning automations",
        de: "Alle Warnungsautomatisierungen anzeigen",
        es: "Ver todas las automatizaciones de advertencia",
        fr: "Voir toutes les automatisations d'avertissement"
      },
      delete: {
        en: "Delete a warning automation",
        de: "Eine Warnungsautomatisierung l\xF6schen",
        es: "Eliminar una automatizaci\xF3n de advertencia",
        fr: "Supprimer une automatisation d'avertissement"
      }
    }
  },
  moderation: {
    ban: {
      en: "Ban a user from the server",
      de: "Einen Benutzer vom Server verbannen",
      es: "Banear a un usuario del servidor",
      fr: "Bannir un utilisateur du serveur"
    },
    kick: {
      en: "Kick a user from the server",
      de: "Einen Benutzer vom Server kicken",
      es: "Expulsar a un usuario del servidor",
      fr: "Expulser un utilisateur du serveur"
    },
    timeout: {
      en: "Timeout a user",
      de: "Einen Benutzer in Timeout setzen",
      es: "Poner a un usuario en tiempo fuera",
      fr: "Mettre un utilisateur en timeout"
    },
    resetxp: {
      en: "Reset a user's XP",
      de: "XP eines Benutzers zur\xFCcksetzen",
      es: "Reiniciar el XP de un usuario",
      fr: "R\xE9initialiser l'XP d'un utilisateur"
    }
  },
  economy: {
    balance: {
      en: "Check your or another user's balance",
      es: "Consulta tu saldo o el de otro usuario",
      fr: "V\xE9rifiez votre solde ou celui d'un autre utilisateur",
      de: "\xDCberpr\xFCfe dein Guthaben oder das eines anderen Benutzers"
    },
    daily: {
      en: "Claim your daily reward",
      es: "Reclama tu recompensa diaria",
      fr: "R\xE9clamez votre r\xE9compense quotidienne",
      de: "Fordere deine t\xE4gliche Belohnung an"
    },
    work: {
      en: "Work to earn money",
      es: "Trabaja para ganar dinero",
      fr: "Travaillez pour gagner de l'argent",
      de: "Arbeite um Geld zu verdienen"
    },
    rob: {
      en: "Attempt to rob another user",
      es: "Intenta robar a otro usuario",
      fr: "Tentez de voler un autre utilisateur",
      de: "Versuche einen anderen Benutzer auszurauben"
    },
    gamble: {
      group: {
        en: "Gambling games",
        es: "Juegos de azar",
        fr: "Jeux de hasard",
        de: "Gl\xFCcksspiele"
      },
      dice: {
        en: "Roll dice against the dealer",
        es: "Tira los dados contra el crupier",
        fr: "Lancez les d\xE9s contre le croupier",
        de: "W\xFCrfle gegen den Dealer"
      },
      coinflip: {
        en: "Flip a coin",
        es: "Lanza una moneda",
        fr: "Lancez une pi\xE8ce",
        de: "Wirf eine M\xFCnze"
      },
      slots: {
        en: "Play the slot machine",
        es: "Juega a la m\xE1quina tragamonedas",
        fr: "Jouez \xE0 la machine \xE0 sous",
        de: "Spiele am Spielautomaten"
      },
      blackjack: {
        en: "Play blackjack against the dealer",
        es: "Juega al blackjack contra el crupier",
        fr: "Jouez au blackjack contre le croupier",
        de: "Spiele Blackjack gegen den Dealer"
      },
      roulette: {
        en: "Play roulette",
        es: "Juega a la ruleta",
        fr: "Jouez \xE0 la roulette",
        de: "Spiele Roulette"
      }
    },
    shop: {
      group: {
        en: "Shop commands",
        es: "Comandos de la tienda",
        fr: "Commandes de la boutique",
        de: "Shop-Befehle"
      },
      view: {
        en: "View available shop items",
        es: "Ver art\xEDculos disponibles en la tienda",
        fr: "Voir les articles disponibles dans la boutique",
        de: "Verf\xFCgbare Shop-Artikel anzeigen"
      },
      buy: {
        en: "Purchase an item from the shop",
        es: "Comprar un art\xEDculo de la tienda",
        fr: "Acheter un article dans la boutique",
        de: "Einen Artikel aus dem Shop kaufen"
      },
      inventory: {
        en: "View your purchased items",
        es: "Ver tus art\xEDculos comprados",
        fr: "Voir vos articles achet\xE9s",
        de: "Ihre gekauften Artikel anzeigen"
      }
    }
  }
};
export const optionDescriptions = {
  page: {
    en: "Page number to view",
    de: "Anzuzeigende Seitennummer",
    es: "N\xFAmero de p\xE1gina a ver",
    fr: "Num\xE9ro de page \xE0 voir"
  },
  role: {
    en: "The role to get information for",
    de: "Die Rolle, f\xFCr die Informationen abgerufen werden sollen",
    es: "El rol del que obtener informaci\xF3n",
    fr: "Le r\xF4le dont obtenir les informations"
  },
  username: {
    en: "Steam username or profile URL",
    de: "Steam-Benutzername oder Profil-URL",
    es: "Nombre de usuario o URL del perfil de Steam",
    fr: "Nom d'utilisateur ou URL du profil Steam"
  },
  user_id: {
    en: "The user ID to look up",
    de: "Die zu suchende Benutzer-ID",
    es: "El ID de usuario a buscar",
    fr: "L'ID utilisateur \xE0 rechercher"
  },
  command: {
    en: "The command to get help for",
    de: "Der Befehl, f\xFCr den Hilfe ben\xF6tigt wird",
    es: "El comando para obtener ayuda",
    fr: "La commande pour laquelle obtenir de l'aide"
  },
  language: {
    en: "The language to select",
    de: "Die auszuw\xE4hlende Sprache",
    es: "El idioma a seleccionar",
    fr: "La langue \xE0 s\xE9lectionner"
  },
  user: {
    en: "The user to target",
    de: "Der Zielbenutzer",
    es: "El usuario objetivo",
    fr: "L'utilisateur cible"
  },
  title: {
    en: "Title of the warning",
    de: "Titel der Warnung",
    es: "T\xEDtulo de la advertencia",
    fr: "Titre de l'avertissement"
  },
  description: {
    en: "Description of the warning",
    de: "Beschreibung der Warnung",
    es: "Descripci\xF3n de la advertencia",
    fr: "Description de l'avertissement"
  },
  level: {
    en: "Warning level (1-10)",
    de: "Warnstufe (1-10)",
    es: "Nivel de advertencia (1-10)",
    fr: "Niveau d'avertissement (1-10)"
  },
  proof: {
    en: "Proof attachment for the warning",
    de: "Beweisanhang f\xFCr die Warnung",
    es: "Prueba adjunta para la advertencia",
    fr: "Preuve jointe pour l'avertissement"
  },
  warnid: {
    en: "The warning ID",
    de: "Die Warnungs-ID",
    es: "El ID de advertencia",
    fr: "L'ID d'avertissement"
  },
  reason: {
    en: "Reason for the action",
    de: "Grund f\xFCr die Aktion",
    es: "Raz\xF3n de la acci\xF3n",
    fr: "Raison de l'action"
  },
  duration: {
    en: "Duration of the action",
    de: "Dauer der Aktion",
    es: "Duraci\xF3n de la acci\xF3n",
    fr: "Dur\xE9e de l'action"
  },
  triggerType: {
    en: "Trigger type for this automation",
    de: "Ausl\xF6ser-Typ f\xFCr diese Automatisierung",
    es: "Tipo de disparador para esta automatizaci\xF3n",
    fr: "Type de d\xE9clencheur pour cette automatisation"
  },
  triggerValue: {
    en: "Value at which the automation triggers",
    de: "Wert, bei dem die Automatisierung ausl\xF6st",
    es: "Valor en el que se activa la automatizaci\xF3n",
    fr: "Valeur \xE0 laquelle l\u2019automatisation se d\xE9clenche"
  },
  notifyChannel: {
    en: "Channel that receives automation notifications",
    de: "Kanal f\xFCr Automatisierungsbenachrichtigungen",
    es: "Canal que recibe las notificaciones de la automatizaci\xF3n",
    fr: "Salon recevant les notifications de l\u2019automatisation"
  },
  balanceUser: {
    en: "The user to check balance for",
    es: "El usuario para verificar el saldo",
    fr: "L'utilisateur dont v\xE9rifier le solde",
    de: "Der Benutzer, dessen Guthaben \xFCberpr\xFCft werden soll"
  },
  robUser: {
    en: "The user to rob",
    es: "El usuario a robar",
    fr: "L'utilisateur \xE0 voler",
    de: "Der Benutzer zum Ausrauben"
  },
  bet: {
    en: "Amount to bet",
    es: "Cantidad a apostar",
    fr: "Montant \xE0 parier",
    de: "Einsatzbetrag"
  },
  coinflipChoice: {
    en: "Heads or tails",
    es: "Cara o cruz",
    fr: "Pile ou face",
    de: "Kopf oder Zahl"
  },
  rouletteType: {
    en: "Type of bet",
    es: "Tipo de apuesta",
    fr: "Type de pari",
    de: "Art der Wette"
  },
  rouletteNumber: {
    en: "Specific number to bet on (0-36)",
    es: "N\xFAmero espec\xEDfico para apostar (0-36)",
    fr: "Num\xE9ro sp\xE9cifique sur lequel parier (0-36)",
    de: "Spezifische Zahl zum Setzen (0-36)"
  },
  buyItem: {
    en: "The item to purchase",
    es: "El art\xEDculo a comprar",
    fr: "L'article \xE0 acheter",
    de: "Der zu kaufende Artikel"
  },
  buyQuantity: {
    en: "Quantity to purchase",
    es: "Cantidad a comprar",
    fr: "Quantit\xE9 \xE0 acheter",
    de: "Zu kaufende Menge"
  },
  automationid: {
    en: "The automation ID to delete",
    de: "Die zu l\xF6schende Automatisierungs-ID",
    es: "El ID de automatizaci\xF3n a eliminar",
    fr: "L'ID d'automatisation \xE0 supprimer"
  }
};
export const choiceLocalizations = {
  coinflip: {
    heads: { en: "Heads", es: "Cara", fr: "Face", de: "Kopf" },
    tails: { en: "Tails", es: "Cruz", fr: "Pile", de: "Zahl" }
  },
  roulette: {
    red: { en: "Red", es: "Rojo", fr: "Rouge", de: "Rot" },
    black: { en: "Black", es: "Negro", fr: "Noir", de: "Schwarz" },
    even: { en: "Even", es: "Par", fr: "Pair", de: "Gerade" },
    odd: { en: "Odd", es: "Impar", fr: "Impair", de: "Ungerade" },
    low: { en: "Low (1-18)", es: "Bajo (1-18)", fr: "Manque (1-18)", de: "Niedrig (1-18)" },
    high: { en: "High (19-36)", es: "Alto (19-36)", fr: "Passe (19-36)", de: "Hoch (19-36)" },
    number: {
      en: "Specific Number",
      es: "N\xFAmero espec\xEDfico",
      fr: "Num\xE9ro sp\xE9cifique",
      de: "Spezifische Zahl"
    },
    dozen1: { en: "1st Dozen", es: "1ra Docena", fr: "1er Douzaine", de: "1. Dutzend" },
    dozen2: { en: "2nd Dozen", es: "2da Docena", fr: "2\xE8me Douzaine", de: "2. Dutzend" },
    dozen3: { en: "3rd Dozen", es: "3ra Docena", fr: "3\xE8me Douzaine", de: "3. Dutzend" }
  }
};
