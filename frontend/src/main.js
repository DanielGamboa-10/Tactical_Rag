const API_BASE_URL = 'http://localhost:8000';

// Global UI & Tactical State
const state = {
  activeTab: 'assistant',
  modality: 'Futsal',
  formationIndex: 0,
  playStyle: 'Posesión & Juego de Posición',
  setPieceCategory: 'free', // 'free' | 'attack' | 'defense'
  setPieceIndex: 0,
  setPieceStep: 0, // 0 = initial setup, 1 = step 1, 2 = step 2, 3 = step 3
  playbackTimers: [],
  motionBlurTimers: [],
  selectedFile: null,
  indexedDocs: [],
  isSendingChat: false,
  isUploadingPdf: false,
  // Tab 3: Tu Propia Plantilla
  squadModality: 'Fútbol 11',
  squadFormationIndex: 0,
  squadPlayers: [],
  squadOptimization: null,
  selectedSquadPlayerId: null,
  exportedBoardLineup: null
};

// Modifiers that dynamically shift player coordinates on the pitch by Play Style
const PLAY_STYLE_MODIFIERS = {
  'Posesión & Juego de Posición': {
    shiftX: 8,
    spreadY: 1.08,
    effect: 'Adelanta ligeramente el bloque (+8m) y abre a los jugadores de banda para crear triángulos de pase constantes.',
    defenseAddon: 'Salir jugando limpio por abajo con apoyos cortos.',
    midfieldAddon: 'Ofrecer siempre dos líneas de pase libres y girar rápido.',
    attackAddon: 'Fijar marcas arriba y abrir la cancha para recibir entre líneas.'
  },
  'Presión Alta (Gegenpressing)': {
    shiftX: 28,
    spreadY: 0.94,
    effect: 'Sube todas las líneas hacia campo rival (+28m) y compacta los carriles para asfixiar la salida y robar cerca del arco.',
    defenseAddon: 'Achicar hacia mitad de cancha vigilando los balones largos a la espalda.',
    midfieldAddon: 'Saltar de inmediato sobre el receptor rival apenas pierde el control.',
    attackAddon: 'Iniciar la presión sobre los centrales y el arquero cerrando líneas de pase.'
  },
  'Bloque Bajo & Contragolpe': {
    shiftX: -26,
    spreadY: 0.82,
    effect: 'Repliega el equipo hacia campo propio (-26m) y junta las líneas por dentro para cerrar espacios y salir disparados tras robo.',
    defenseAddon: 'Proteger el área sin salir a destiempo y despejar o lanzar rápido al recuperar.',
    midfieldAddon: 'Cerrar pasillos internos delante de los defensas y lanzar el primer pase largo.',
    attackAddon: 'Quedar descolgados listos para atacar el espacio vacío a máxima velocidad.'
  },
  'Juego Directo & Vertical': {
    shiftX: 14,
    spreadY: 1.04,
    effect: 'Estira las líneas de ataque (+14m) buscando envíos largos al punta y ganar la segunda jugada en campo contrario.',
    defenseAddon: 'Buscar pases largos directos hacia los delanteros evitando riesgos atrás.',
    midfieldAddon: 'Atacar con todo la caída del balón (segunda jugada) cerca del punta.',
    attackAddon: 'Aguantar el balón de espaldas, peinar y atacar la espalda de la defensa.'
  },
  'Rotación Dinámica': {
    shiftX: 12,
    spreadY: 1.14,
    effect: 'Amplía la movilidad y apertura del equipo (+14% amplitud) intercambiando puestos entre líneas para desordenar marcas.',
    defenseAddon: 'Conducir para atraer marcas y permutar el puesto si un compañero sube.',
    midfieldAddon: 'Intercambiar alturas constantemente con extremos y laterales.',
    attackAddon: 'Salir de la zona para arrastrar centrales y dejarle el hueco al volante que llega.'
  }
};

// Complete Formation Catalog by Modality (30 Formations across 4 sports, viewBox 360x220)
const FORMATIONS_BY_MODALITY = {
  'Futsal': [
    {
      code: '1-3-1 (Rombo)',
      overview: 'Esquema clásico con cierre fijo, dos alas abiertas y un pívot de referencia arriba.',
      defenseRole: 'El cierre (4) ordena la marca, cubre las subidas de las alas y asegura el primer pase.',
      midfieldRole: 'Las alas (7 y 10) abren toda la pista de 40x20m, encaran en 1v1 y hacen diagonales al segundo palo.',
      attackRole: 'El pívot (9) fija al cierre rival de espaldas para girar y rematar o descargar de cara.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'CIE', x: 115, y: 110 },
        { num: '7', role: 'ALA-I', x: 195, y: 45 },
        { num: '10', role: 'ALA-D', x: 195, y: 175 },
        { num: '9', role: 'PIV', x: 285, y: 110 }
      ],
      links: [[1, 2], [1, 3], [1, 4], [2, 4], [3, 4]]
    },
    {
      code: '1-2-2 (Cuadrado)',
      overview: 'Estructura equilibrada en dos bloques de dos jugadores ideal para presionar y salir con orden.',
      defenseRole: 'Dos jugadores en base (4 y 5) se reparten el ancho de la cancha y aseguran el equilibrio.',
      midfieldRole: 'Conexión paralela y diagonal constante entre la primera línea y los dos hombres de arriba.',
      attackRole: 'Dos atacantes (7 y 9) ocupan ambos pasillos ofensivos para tirar paredes y atacar la espalda.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'CIE-I', x: 132, y: 65 },
        { num: '5', role: 'CIE-D', x: 132, y: 155 },
        { num: '7', role: 'ALA-I', x: 262, y: 62 },
        { num: '9', role: 'PIV-D', x: 262, y: 158 }
      ],
      links: [[1, 2], [1, 3], [2, 4], [3, 4], [1, 4]]
    },
    {
      code: '1-4-0 (Sistema Plano)',
      overview: 'Los 4 jugadores de campo se paran en línea sin pívot fijo para rotar sin parar y vaciar la espalda rival.',
      defenseRole: 'Rotación circular continua: quien pasa la pelota corta hacia adelante y otro ocupa su espalda.',
      midfieldRole: 'Los cuatro jugadores alternan puestos en línea buscando sorprender con cortes a la espalda.',
      attackRole: 'Sin referencia fija para los defensas rivales; se ataca el espacio libre con pases al hueco.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'UNI-1', x: 175, y: 36 },
        { num: '6', role: 'UNI-2', x: 165, y: 86 },
        { num: '8', role: 'UNI-3', x: 165, y: 134 },
        { num: '10', role: 'UNI-4', x: 175, y: 184 }
      ],
      links: [[1, 2], [2, 3], [3, 4], [1, 3], [2, 4]]
    },
    {
      code: '1-1-2-1 (Pirámide)',
      overview: 'Variante con cierre retrasado, dos alas cerradas en el medio y un pívot profundo para proteger el carril central.',
      defenseRole: 'El cierre (4) actúa como libre detrás de la línea de volantes para cortar contragolpes.',
      midfieldRole: 'Dos interiores (7 y 8) cierran el centro de la pista y salen rápido en apoyo del pívot.',
      attackRole: 'El pívot (9) estira al rival y espera la llegada de segunda línea.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'CIE', x: 100, y: 110 },
        { num: '7', role: 'INT-I', x: 185, y: 68 },
        { num: '8', role: 'INT-D', x: 185, y: 152 },
        { num: '9', role: 'PIV', x: 288, y: 110 }
      ],
      links: [[1, 2], [1, 3], [2, 3], [2, 4], [3, 4]]
    },
    {
      code: '1-2-1-1 (Y Invertida)',
      overview: 'Doble cierre en la base, un ala-enganche centralizador y un pívot profundo para salidas seguras ante presión.',
      defenseRole: 'Doble base (4 y 5) que asegura superioridad 2v1 en salida desde el fondo.',
      midfieldRole: 'El conector central (10) recibe entre líneas y gira para habilitar al pívot.',
      attackRole: 'El pívot (9) fija en el borde del área esperando la pared vertical.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'CIE-I', x: 112, y: 66 },
        { num: '5', role: 'CIE-D', x: 112, y: 154 },
        { num: '10', role: 'ENG', x: 198, y: 110 },
        { num: '9', role: 'PIV', x: 292, y: 110 }
      ],
      links: [[1, 2], [1, 3], [2, 3], [3, 4]]
    },
    {
      code: '5-0 (Portero-Jugador)',
      overview: 'Superioridad 5 contra 4 en campo rival adelantando al arquero-jugador para remontar o controlar el balón.',
      defenseRole: 'El portero-jugador (1) y el cierre (4) mueven la pelota de lado a lado con máxima seguridad.',
      midfieldRole: 'Las alas abiertas hunden a la defensa rival contra su propia área.',
      attackRole: 'Dos jugadores en los postes buscan el pase filtrado al segundo palo para empujarla.',
      players: [
        { num: '1', role: 'PJ', x: 185, y: 65, gk: true },
        { num: '4', role: 'CIE', x: 185, y: 155 },
        { num: '7', role: 'ALA-I', x: 255, y: 34 },
        { num: '10', role: 'ALA-D', x: 255, y: 186 },
        { num: '9', role: 'PIV', x: 305, y: 110 }
      ],
      links: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [0, 4]]
    },
    {
      code: '1-3-1 (Presión Alta)',
      overview: 'Bloque adelantado en tres cuartos de pista para ahogar el saque rival y robar a 10 metros del arco.',
      defenseRole: 'El cierre (4) se para en mitad de cancha anticipando cualquier pelotazo largo al pívot rival.',
      midfieldRole: 'Las alas (7 y 10) cierran las bandas obligando al rival a jugar hacia la trampa central.',
      attackRole: 'El pívot (9) acosa al sacador e impide el cambio de orientación limpio.',
      players: [
        { num: '1', role: 'POR', x: 52, y: 110, gk: true },
        { num: '4', role: 'CIE', x: 175, y: 110 },
        { num: '7', role: 'ALA-I', x: 245, y: 50 },
        { num: '10', role: 'ALA-D', x: 245, y: 170 },
        { num: '9', role: 'PIV', x: 305, y: 110 }
      ],
      links: [[1, 2], [1, 3], [2, 4], [3, 4], [1, 4]]
    }
  ],
  'Fútbol 7': [
    {
      code: '1-2-3-1',
      overview: 'El sistema más equilibrado en Fútbol 7: dos centrales firmes, tres volantes con amplitud y un referente de área.',
      defenseRole: 'Dos centrales (2 y 4) cierran el carril interior y salen jugando con el mediocentro.',
      midfieldRole: 'El mediocentro (6) sostiene el equilibrio mientras los carrileros (7 y 11) desbordan por banda.',
      attackRole: 'El delantero centro (9) fija a los defensas y define los centros o paredes con los volantes.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '2', role: 'DFC-I', x: 105, y: 72 },
        { num: '4', role: 'DFC-D', x: 105, y: 148 },
        { num: '6', role: 'MCD', x: 185, y: 110 },
        { num: '7', role: 'CAR-I', x: 215, y: 42 },
        { num: '11', role: 'CAR-D', x: 215, y: 178 },
        { num: '9', role: 'DC', x: 292, y: 110 }
      ],
      links: [[1, 3], [2, 3], [3, 4], [3, 5], [3, 6], [4, 6], [5, 6]]
    },
    {
      code: '1-3-2-1 (Árbol)',
      overview: 'Seguridad defensiva con línea de tres atrás, doble volante creativo en el medio y un punta.',
      defenseRole: 'Líbero central (4) respaldado por dos laterales (3 y 2) que cierran bandas y pasan al ataque.',
      midfieldRole: 'Doble mediocentro (8 y 10) que maneja los tiempos, filtra pases y pisa el área rival.',
      attackRole: 'El 9 aguanta arriba y descarga hacia los dos volantes que llegan de frente.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '3', role: 'LAT-I', x: 108, y: 46 },
        { num: '4', role: 'LIB', x: 96, y: 110 },
        { num: '2', role: 'LAT-D', x: 108, y: 174 },
        { num: '8', role: 'MC-I', x: 202, y: 78 },
        { num: '10', role: 'MC-D', x: 202, y: 142 },
        { num: '9', role: 'DC', x: 295, y: 110 }
      ],
      links: [[2, 4], [2, 5], [1, 4], [3, 5], [4, 6], [5, 6]]
    },
    {
      code: '1-2-1-2-1 (Rombo)',
      overview: 'Escalonamiento en cuatro alturas para dominar el centro del campo con superioridad de pases cortos.',
      defenseRole: 'Dos zagueros (2 y 4) abiertos para iniciar la salida con el pivote.',
      midfieldRole: 'Un pivote (5) detrás de dos interiores ofensivos (8 y 10) que conectan todo el equipo.',
      attackRole: 'Delantero rápido (9) tirando diagonales constantes a los pases filtrados.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '2', role: 'DFC-I', x: 100, y: 72 },
        { num: '4', role: 'DFC-D', x: 100, y: 148 },
        { num: '5', role: 'PIV', x: 158, y: 110 },
        { num: '8', role: 'INT-I', x: 225, y: 60 },
        { num: '10', role: 'INT-D', x: 225, y: 160 },
        { num: '9', role: 'DC', x: 298, y: 110 }
      ],
      links: [[1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6]]
    },
    {
      code: '1-3-1-2',
      overview: 'Firmeza atrás con tres defensores, un enganche o mediocentro eje y dos delanteros peligrosos arriba.',
      defenseRole: 'Tres defensas (3, 4 y 2) que ocupan todo el ancho para frenar extremos rivales.',
      midfieldRole: 'Un mediocentro total (6) que distribuye rápido hacia la dupla ofensiva.',
      attackRole: 'Dos delanteros (7 y 9) que combinan entre sí y castigan en cada transición.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 106, y: 48 },
        { num: '4', role: 'DF-C', x: 96, y: 110 },
        { num: '2', role: 'DF-D', x: 106, y: 172 },
        { num: '6', role: 'MC', x: 188, y: 110 },
        { num: '7', role: 'DC-I', x: 278, y: 74 },
        { num: '9', role: 'DC-D', x: 278, y: 146 }
      ],
      links: [[1, 4], [2, 4], [3, 4], [4, 5], [4, 6], [5, 6]]
    },
    {
      code: '1-2-2-2',
      overview: 'Tres líneas de dos jugadores (caja táctica) muy vertical para atacar con cuatro hombres.',
      defenseRole: 'Pareja de centrales (2 y 4) rápida en los cruces a las bandas.',
      midfieldRole: 'Doble volante (6 y 8) que recupera y lanza de inmediato hacia los dos puntas.',
      attackRole: 'Dos puntas abiertos o cerrados (7 y 9) que atacan el área en paralelo.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '2', role: 'DFC-I', x: 105, y: 72 },
        { num: '4', role: 'DFC-D', x: 105, y: 148 },
        { num: '6', role: 'MC-I', x: 192, y: 68 },
        { num: '8', role: 'MC-D', x: 192, y: 152 },
        { num: '7', role: 'DC-I', x: 282, y: 72 },
        { num: '9', role: 'DC-D', x: 282, y: 148 }
      ],
      links: [[1, 3], [2, 4], [3, 4], [3, 5], [4, 6], [5, 6]]
    },
    {
      code: '1-3-3 (Ofensivo)',
      overview: 'Esquema directo de dos líneas de tres hombres para presionar arriba y atacar con amplitud máxima.',
      defenseRole: 'Línea de tres (3, 4 y 2) que achica hasta mitad de cancha y lanza rápido.',
      midfieldRole: 'Transición directa de los laterales hacia los extremos sin pausa en el medio.',
      attackRole: 'Tridente ofensivo (11, 9 y 7) ocupando todo el frente de ataque.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 118, y: 48 },
        { num: '4', role: 'LIB', x: 108, y: 110 },
        { num: '2', role: 'DF-D', x: 118, y: 172 },
        { num: '11', role: 'EXT-I', x: 265, y: 44 },
        { num: '9', role: 'DC', x: 288, y: 110 },
        { num: '7', role: 'EXT-D', x: 265, y: 176 }
      ],
      links: [[1, 4], [2, 5], [3, 6], [4, 5], [5, 6]]
    },
    {
      code: '1-4-1-1 (Bloque Bajo)',
      overview: 'Muralla defensiva de cuatro hombres atrás, un pivote barredor y un punta veloz para el contragolpe.',
      defenseRole: 'Cuatro defensores (3, 4, 5 y 2) que cierran toda la frontal del área.',
      midfieldRole: 'El pivote (6) tapona el carril central y lanza balones largos al espacio.',
      attackRole: 'Un delantero rápido (9) listo para ganar en velocidad a campo abierto.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '3', role: 'LI', x: 96, y: 38 },
        { num: '4', role: 'DFC-I', x: 88, y: 86 },
        { num: '5', role: 'DFC-D', x: 88, y: 134 },
        { num: '2', role: 'LD', x: 96, y: 182 },
        { num: '6', role: 'MCD', x: 168, y: 110 },
        { num: '9', role: 'DC', x: 285, y: 110 }
      ],
      links: [[2, 5], [3, 5], [1, 5], [4, 5], [5, 6]]
    }
  ],
  'Fútbol 9': [
    {
      code: '1-3-3-2',
      overview: 'Puente formativo ideal hacia Fútbol 11: línea de tres defensas, triángulo en el medio y dos delanteros.',
      defenseRole: 'Tres defensas (3, 4 y 2) que aseguran coberturas y salida limpia por los costados.',
      midfieldRole: 'Un pivote (5) más dos interiores/carrileros (8 y 10) que abastecen el ataque.',
      attackRole: 'Doble punta (7 y 9) para fijar centrales y tirar diagonales hacia las bandas.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 96, y: 50 },
        { num: '4', role: 'DF-C', x: 90, y: 110 },
        { num: '2', role: 'DF-D', x: 96, y: 170 },
        { num: '5', role: 'PIV', x: 175, y: 110 },
        { num: '8', role: 'INT-I', x: 198, y: 48 },
        { num: '10', role: 'INT-D', x: 198, y: 172 },
        { num: '7', role: 'DC-I', x: 285, y: 80 },
        { num: '9', role: 'DC-D', x: 285, y: 140 }
      ],
      links: [[2, 4], [4, 5], [4, 6], [5, 7], [6, 8], [7, 8]]
    },
    {
      code: '1-4-3-1',
      overview: 'Introduce la línea de cuatro defensas clásica de Fútbol 11 con tres volantes y un punta.',
      defenseRole: 'Dos centrales (4 y 5) y dos laterales (3 y 2) que aprenden a bascular en bloque.',
      midfieldRole: 'Tridente en el medio (6, 8 y 10) para adueñarse de la pelota y filtrar pases.',
      attackRole: 'Un delantero centro (9) que ataca los espacios y espera la subida de los interiores.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'LI', x: 98, y: 38 },
        { num: '4', role: 'DFC', x: 90, y: 86 },
        { num: '5', role: 'DFC', x: 90, y: 134 },
        { num: '2', role: 'LD', x: 98, y: 182 },
        { num: '8', role: 'INT-I', x: 195, y: 58 },
        { num: '6', role: 'PIV', x: 182, y: 110 },
        { num: '10', role: 'INT-D', x: 195, y: 162 },
        { num: '9', role: 'DC', x: 292, y: 110 }
      ],
      links: [[2, 6], [3, 6], [6, 5], [6, 7], [5, 8], [7, 8], [6, 8]]
    },
    {
      code: '1-3-4-1',
      overview: 'Superioridad total en la mitad de la cancha con cuatro volantes (doble pivote y dos extremos).',
      defenseRole: 'Tres defensas rápidos (3, 4 y 2) atentos a los cruces.',
      midfieldRole: 'Doble volante central (6 y 8) junto a dos extremos bien abiertos (7 y 11).',
      attackRole: 'Referente de área (9) abastecido por centros y pases interiores.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 96, y: 52 },
        { num: '4', role: 'DF-C', x: 90, y: 110 },
        { num: '2', role: 'DF-D', x: 96, y: 168 },
        { num: '6', role: 'MC-I', x: 178, y: 82 },
        { num: '8', role: 'MC-D', x: 178, y: 138 },
        { num: '7', role: 'EXT-I', x: 222, y: 36 },
        { num: '11', role: 'EXT-D', x: 222, y: 184 },
        { num: '9', role: 'DC', x: 298, y: 110 }
      ],
      links: [[4, 5], [4, 6], [5, 7], [6, 8], [7, 8]]
    },
    {
      code: '1-3-2-3',
      overview: 'Esquema ultra ofensivo con tridente de ataque para presionar alto la salida rival.',
      defenseRole: 'Tres defensores (3, 4 y 2) que sostienen la línea alta en mitad de cancha.',
      midfieldRole: 'Dos mediocentros (6 y 8) que recuperan tras pérdida y conectan con los tres de arriba.',
      attackRole: 'Dos extremos abiertos (7 y 11) y un 9 de área para presionar y definir.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 96, y: 52 },
        { num: '4', role: 'DF-C', x: 90, y: 110 },
        { num: '2', role: 'DF-D', x: 96, y: 168 },
        { num: '6', role: 'MC-I', x: 180, y: 80 },
        { num: '8', role: 'MC-D', x: 180, y: 140 },
        { num: '11', role: 'EI', x: 278, y: 44 },
        { num: '9', role: 'DC', x: 295, y: 110 },
        { num: '7', role: 'ED', x: 278, y: 176 }
      ],
      links: [[2, 4], [2, 5], [4, 6], [4, 7], [5, 7], [5, 8]]
    },
    {
      code: '1-4-2-2',
      overview: 'Estructura simétrica en pasillos interiores con línea de cuatro atrás, doble contención y dos atacantes.',
      defenseRole: 'Línea de cuatro (3, 4, 5 y 2) sólida que proyecta a los laterales por afuera.',
      midfieldRole: 'Doble pivote (6 y 8) que protege el centro y libera las bandas.',
      attackRole: 'Dos atacantes móviles (10 y 9) que tiran paredes por el centro.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'LI', x: 98, y: 38 },
        { num: '4', role: 'DFC', x: 90, y: 86 },
        { num: '5', role: 'DFC', x: 90, y: 134 },
        { num: '2', role: 'LD', x: 98, y: 182 },
        { num: '6', role: 'MCD', x: 185, y: 78 },
        { num: '8', role: 'MCD', x: 185, y: 142 },
        { num: '10', role: 'DC-I', x: 282, y: 76 },
        { num: '9', role: 'DC-D', x: 282, y: 144 }
      ],
      links: [[2, 5], [3, 6], [5, 6], [5, 7], [6, 8], [7, 8]]
    },
    {
      code: '1-3-5-0 (Falso 9)',
      overview: 'Población total del mediocampo con un Falso 9 que baja a recibir y dos extremos que atacan el espacio vacío.',
      defenseRole: 'Tres defensas (3, 4 y 2) con salida limpia por bajo.',
      midfieldRole: 'Pivote (6), dos interiores (8 y 10) y el Falso 9 (9) creando superioridad 4v2 en el medio.',
      attackRole: 'Los extremos (11 y 7) entran en diagonal al espacio que vacía el Falso 9.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 96, y: 52 },
        { num: '4', role: 'DF-C', x: 88, y: 110 },
        { num: '2', role: 'DF-D', x: 96, y: 168 },
        { num: '6', role: 'PIV', x: 158, y: 110 },
        { num: '8', role: 'INT-I', x: 202, y: 74 },
        { num: '10', role: 'INT-D', x: 202, y: 146 },
        { num: '11', role: 'EXT-I', x: 276, y: 38 },
        { num: '9', role: 'F9', x: 245, y: 110 }
      ],
      links: [[4, 5], [4, 6], [5, 8], [6, 8], [8, 7]]
    },
    {
      code: '1-4-1-3',
      overview: 'Línea de cuatro atrás protegida por un pivote ancla y tres hombres ofensivos arriba.',
      defenseRole: 'Cuatro defensores (3, 4, 5 y 2) bien escalonados.',
      midfieldRole: 'El pivote (6) barre delante de los centrales y conecta de primera con los tres de arriba.',
      attackRole: 'Dos extremos (11 y 7) y un punta (9) atacando de forma directa.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'LI', x: 96, y: 38 },
        { num: '4', role: 'DFC', x: 88, y: 86 },
        { num: '5', role: 'DFC', x: 88, y: 134 },
        { num: '2', role: 'LD', x: 96, y: 182 },
        { num: '6', role: 'MCD', x: 168, y: 110 },
        { num: '11', role: 'EI', x: 256, y: 46 },
        { num: '9', role: 'DC', x: 286, y: 110 },
        { num: '7', role: 'ED', x: 256, y: 174 }
      ],
      links: [[2, 5], [3, 5], [5, 6], [5, 7], [5, 8], [6, 7], [8, 7]]
    }
  ],
  'Fútbol 11': [
    {
      code: '1-4-3-3',
      overview: 'Ocupación completa de los 5 carriles con pivote posicional, dos interiores y tridente de ataque.',
      defenseRole: 'Dos centrales con buena salida (4 y 5) y laterales (3 y 2) que pasan al ataque en amplitud.',
      midfieldRole: 'Un volante central (6) que equilibra y dos interiores (8 y 10) que pisan zonas de remate.',
      attackRole: 'Dos extremos abiertos (11 y 7) en 1v1 y un 9 fijando a los centrales.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 95, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 95, y: 186 },
        { num: '6', role: 'PIV', x: 165, y: 110 },
        { num: '8', role: 'INT', x: 205, y: 68 },
        { num: '10', role: 'INT', x: 205, y: 152 },
        { num: '11', role: 'EI', x: 282, y: 42 },
        { num: '9', role: 'DC', x: 300, y: 110 },
        { num: '7', role: 'ED', x: 282, y: 178 }
      ],
      links: [[2, 5], [3, 5], [5, 6], [5, 7], [6, 8], [6, 9], [7, 10], [7, 9]]
    },
    {
      code: '1-4-2-3-1',
      overview: 'Seguridad con doble pivote delante de la defensa y un enganche libre detrás del 9.',
      defenseRole: 'Línea de cuatro respaldada siempre por dos volantes de contención.',
      midfieldRole: 'Doble pivote (6 y 8) que recupera y entrega limpio al enganche (10).',
      attackRole: 'Tres mediapuntas (11, 10 y 7) asociándose detrás del delantero centro (9).',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 94, y: 34 },
        { num: '4', role: 'DFC', x: 85, y: 84 },
        { num: '5', role: 'DFC', x: 85, y: 136 },
        { num: '2', role: 'LD', x: 94, y: 186 },
        { num: '6', role: 'MCD', x: 162, y: 82 },
        { num: '8', role: 'MCD', x: 162, y: 138 },
        { num: '11', role: 'EI', x: 235, y: 42 },
        { num: '10', role: 'MCO', x: 230, y: 110 },
        { num: '7', role: 'ED', x: 235, y: 178 },
        { num: '9', role: 'DC', x: 304, y: 110 }
      ],
      links: [[5, 6], [5, 8], [6, 8], [8, 7], [8, 9], [8, 10]]
    },
    {
      code: '1-3-5-2',
      overview: 'Tres centrales atrás, dos carrileros de recorrido completo y dupla de delanteros en ataque.',
      defenseRole: 'Tres centrales (3, 4 y 5) que sobran siempre contra un solo punta rival.',
      midfieldRole: 'Pivote (6), dos interiores (8 y 10) y dos carrileros (11 y 2) que hacen toda la banda.',
      attackRole: 'Dos delanteros (7 y 9) que tiran paredes y rematan los centros de los carrileros.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'DFC-I', x: 88, y: 58 },
        { num: '4', role: 'LIB', x: 82, y: 110 },
        { num: '5', role: 'DFC-D', x: 88, y: 162 },
        { num: '11', role: 'CAR-I', x: 188, y: 32 },
        { num: '6', role: 'PIV', x: 162, y: 110 },
        { num: '8', role: 'INT-I', x: 205, y: 78 },
        { num: '10', role: 'INT-D', x: 205, y: 142 },
        { num: '2', role: 'CAR-D', x: 188, y: 188 },
        { num: '7', role: 'DC-I', x: 294, y: 82 },
        { num: '9', role: 'DC-D', x: 294, y: 138 }
      ],
      links: [[2, 5], [5, 6], [5, 7], [4, 9], [8, 10], [6, 9], [7, 10]]
    },
    {
      code: '1-4-4-2 (Clásico)',
      overview: 'Dos líneas de cuatro muy ordenadas y compactas con dos delanteros arriba.',
      defenseRole: 'Línea de cuatro clásica (3, 4, 5 y 2) cerrando espacios a lo ancho.',
      midfieldRole: 'Doble volante central (6 y 8) y dos volantes por afuera (11 y 7) que hacen el ida y vuelta.',
      attackRole: 'Un delantero de área (9) acompañado por un segunda punta móvil (10).',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 92, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 92, y: 186 },
        { num: '11', role: 'MI', x: 192, y: 38 },
        { num: '6', role: 'MC', x: 182, y: 86 },
        { num: '8', role: 'MC', x: 182, y: 134 },
        { num: '7', role: 'MD', x: 192, y: 182 },
        { num: '10', role: 'SD', x: 286, y: 80 },
        { num: '9', role: 'DC', x: 294, y: 140 }
      ],
      links: [[6, 7], [5, 9], [6, 9], [7, 10], [8, 10], [9, 10]]
    },
    {
      code: '1-4-4-2 (Rombo)',
      overview: 'Dominio del carril central con un 5 de marca, dos interiores y un 10 clásico detrás de dos puntas.',
      defenseRole: 'Los laterales (3 y 2) suben constantemente para dar toda la amplitud por las bandas.',
      midfieldRole: 'Rombo en el medio: pivote (5), dos interiores (8 y 6) y enganche (10).',
      attackRole: 'Dos delanteros (7 y 9) que tiran diagonales desde el centro hacia afuera.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 96, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 96, y: 186 },
        { num: '6', role: 'PIV', x: 154, y: 110 },
        { num: '8', role: 'INT-I', x: 196, y: 66 },
        { num: '7', role: 'INT-D', x: 196, y: 154 },
        { num: '10', role: 'ENG', x: 238, y: 110 },
        { num: '11', role: 'DC-I', x: 296, y: 78 },
        { num: '9', role: 'DC-D', x: 296, y: 142 }
      ],
      links: [[5, 6], [5, 7], [6, 8], [7, 8], [8, 9], [8, 10]]
    },
    {
      code: '1-3-4-3',
      overview: 'Sistema ofensivo de alta presión con tres centrales, cuatro volantes en línea y tres atacantes.',
      defenseRole: 'Tres centrales rápidos (3, 4 y 5) para defender con campo abierto.',
      midfieldRole: 'Doble mediocentro (6 y 8) flanqueado por dos carrileros profundos (11 y 2).',
      attackRole: 'Tridente ofensivo (7, 9 y 10) que fija y presiona la salida rival.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'DFC-I', x: 88, y: 56 },
        { num: '4', role: 'LIB', x: 82, y: 110 },
        { num: '5', role: 'DFC-D', x: 88, y: 164 },
        { num: '11', role: 'CAR-I', x: 185, y: 34 },
        { num: '6', role: 'MC', x: 178, y: 86 },
        { num: '8', role: 'MC', x: 178, y: 134 },
        { num: '2', role: 'CAR-D', x: 185, y: 186 },
        { num: '10', role: 'EI', x: 278, y: 48 },
        { num: '9', role: 'DC', x: 298, y: 110 },
        { num: '7', role: 'ED', x: 278, y: 172 }
      ],
      links: [[5, 6], [4, 8], [5, 8], [5, 9], [6, 9], [6, 10], [7, 10]]
    },
    {
      code: '1-4-1-4-1',
      overview: 'Pivote único barriendo delante de la defensa y línea de cuatro volantes ofensivos detrás del 9.',
      defenseRole: 'Cuatro defensas respaldados por un mediocentro posicional (6) que nunca pierde la zona.',
      midfieldRole: 'Dos interiores (8 y 10) y dos extremos (11 y 7) alineados para presionar y llegar en oleada.',
      attackRole: 'El delantero centro (9) fija a los centrales y abre huecos para la llegada de los interiores.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 92, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 92, y: 186 },
        { num: '6', role: 'MCD', x: 150, y: 110 },
        { num: '11', role: 'MI', x: 218, y: 36 },
        { num: '8', role: 'INT-I', x: 212, y: 84 },
        { num: '10', role: 'INT-D', x: 212, y: 136 },
        { num: '7', role: 'MD', x: 218, y: 184 },
        { num: '9', role: 'DC', x: 298, y: 110 }
      ],
      links: [[5, 7], [5, 8], [7, 9], [8, 9], [6, 9], [9, 10]]
    },
    {
      code: '1-4-3-2-1 (Árbol de Navidad)',
      overview: ' Superioridad interior con tres volantes de contención/creación y dos mediapuntas cerrados detrás del 9.',
      defenseRole: 'Línea de cuatro donde los laterales (3 y 2) suben como carrileros por las bandas libres.',
      midfieldRole: 'Tridente central (6, 8 y 5) que blinda el medio y entrega a los dos enganches.',
      attackRole: 'Dos mediapuntas creativos (10 y 7) filtrando pases al delantero centro (9).',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 94, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 94, y: 186 },
        { num: '8', role: 'MC-I', x: 168, y: 66 },
        { num: '6', role: 'PIV', x: 160, y: 110 },
        { num: '14', role: 'MC-D', x: 168, y: 154 },
        { num: '10', role: 'MCO-I', x: 238, y: 80 },
        { num: '7', role: 'MCO-D', x: 238, y: 140 },
        { num: '9', role: 'DC', x: 300, y: 110 }
      ],
      links: [[6, 5], [6, 7], [5, 8], [7, 9], [8, 10], [9, 10]]
    },
    {
      code: '1-5-3-2 (Bloque Bajo)',
      overview: 'Cerrojo defensivo con línea de cinco atrás, tres volantes de contención y dos puntas rápidos para contragolpear.',
      defenseRole: 'Cinco defensores (3, 4, 5, 6 y 2) que blindan el área y cierran todos los pasillos.',
      midfieldRole: 'Tres volantes juntos (8, 14 y 10) que basculan y lanzan al espacio tras robo.',
      attackRole: 'Dos puntas veloces (7 y 9) listos para correr al contragolpe.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 86, y: 30 },
        { num: '4', role: 'DFC-I', x: 78, y: 70 },
        { num: '5', role: 'LIB', x: 74, y: 110 },
        { num: '6', role: 'DFC-D', x: 78, y: 150 },
        { num: '2', role: 'LD', x: 86, y: 190 },
        { num: '8', role: 'MC-I', x: 164, y: 68 },
        { num: '14', role: 'MCD', x: 156, y: 110 },
        { num: '10', role: 'MC-D', x: 164, y: 152 },
        { num: '7', role: 'DC-I', x: 276, y: 80 },
        { num: '9', role: 'DC-D', x: 276, y: 140 }
      ],
      links: [[3, 7], [6, 7], [7, 8], [6, 9], [8, 10], [9, 10]]
    }
  ]
};

// Prepared Plays / Set Pieces Catalog by Category ('attack' vs 'defense') and Modality
// Player indexes: 0 = GK, 1..N = outfield players from back to front
const FUTSAL_ATTACK_PLAYS = [
  {
    name: 'Tiro de Esquina (Arrastre al Primer Palo)',
    steps: [
      'El Ala (idx 2) se ubica en la esquina derecha junto al balón (⚽).',
      'El Pívot (idx 4) pica al primer palo arrastrando al cierre rival.',
      'El Ala opuesta (idx 3) entra al punto penal, recibe el pase raso y fusila al arco.'
    ],
    movements: [
      { playerIndex: 2, startX: 344, startY: 18, endX: 334, endY: 28 },
      { playerIndex: 4, startX: 282, startY: 112, endX: 326, endY: 66 },
      { playerIndex: 3, startX: 220, startY: 162, endX: 292, endY: 112 },
      { playerIndex: 1, startX: 175, startY: 110, endX: 215, endY: 110 }
    ],
    ballPath: [
      { x: 344, y: 18 },
      { x: 292, y: 112, type: 'pass' },
      { x: 348, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 292, cy: 112, r: 16 }]
  },
  {
    name: 'Córner (Cortina al Segundo Palo)',
    steps: [
      'El Ala (idx 2) cobra el córner desde banda derecha.',
      'El Pívot (idx 4) bloquea en el centro del área para liberar el carril exterior.',
      'El Cierre (idx 1) llega desde atrás hacia la frontal, recibe de aire o raso y remata.'
    ],
    movements: [
      { playerIndex: 2, startX: 344, startY: 18, endX: 330, endY: 32 },
      { playerIndex: 4, startX: 295, startY: 98, endX: 315, endY: 82 },
      { playerIndex: 3, startX: 270, startY: 145, endX: 322, endY: 158 },
      { playerIndex: 1, startX: 165, startY: 110, endX: 258, endY: 115 }
    ],
    ballPath: [
      { x: 344, y: 18 },
      { x: 258, y: 115, type: 'pass' },
      { x: 348, y: 112, type: 'shot' }
    ],
    zones: [{ cx: 258, cy: 115, r: 17 }]
  },
  {
    name: 'Tiro Libre Frontal (Pared y Remate)',
    steps: [
      'El Cierre (idx 1) y el Ala (idx 2) se paran frente al balón en la frontal del área.',
      'El Pívot (idx 4) hace pantalla en el poste derecho de la barrera.',
      'El Cierre toca corto al Ala (idx 3) que entra por derecha y define cruzado.'
    ],
    movements: [
      { playerIndex: 1, startX: 245, startY: 108, endX: 240, endY: 108 },
      { playerIndex: 2, startX: 248, startY: 90, endX: 305, endY: 64 },
      { playerIndex: 4, startX: 286, startY: 108, endX: 318, endY: 94 },
      { playerIndex: 3, startX: 235, startY: 162, endX: 288, endY: 145 }
    ],
    ballPath: [
      { x: 245, y: 108 },
      { x: 288, y: 145, type: 'pass' },
      { x: 348, y: 104, type: 'shot' }
    ],
    zones: [{ cx: 288, cy: 145, r: 16 }]
  },
  {
    name: 'Tiro Libre Lateral (Centro Pasado)',
    steps: [
      'El Ala (idx 2) cobra la falta desde banda izquierda en tres cuartos.',
      'El Cierre (idx 1) amaga venir en apoyo corto para arrastrar una marca.',
      'Pase tenso al segundo palo donde el Pívot (idx 4) entra solo para empujarla.'
    ],
    movements: [
      { playerIndex: 2, startX: 252, startY: 26, endX: 256, endY: 32 },
      { playerIndex: 1, startX: 195, startY: 95, endX: 230, endY: 62 },
      { playerIndex: 3, startX: 265, startY: 120, endX: 310, endY: 102 },
      { playerIndex: 4, startX: 270, startY: 175, endX: 326, endY: 148 }
    ],
    ballPath: [
      { x: 252, y: 26 },
      { x: 326, y: 148, type: 'pass' },
      { x: 348, y: 114, type: 'shot' }
    ],
    zones: [{ cx: 326, cy: 148, r: 16 }]
  },
  {
    name: 'Saque de Banda Ofensivo (Triangulación)',
    steps: [
      'El Ala (idx 2) saca de banda hacia el Cierre (idx 1) en el eje central.',
      'El Pívot (idx 4) bloquea al defensor de banda y pica al área.',
      'El Cierre devuelve en pared profunda al Ala (idx 2) que corta hacia adentro y remata.'
    ],
    movements: [
      { playerIndex: 2, startX: 215, startY: 16, endX: 296, endY: 58 },
      { playerIndex: 1, startX: 185, startY: 92, endX: 222, endY: 76 },
      { playerIndex: 4, startX: 278, startY: 85, endX: 318, endY: 112 },
      { playerIndex: 3, startX: 210, startY: 168, endX: 295, endY: 156 }
    ],
    ballPath: [
      { x: 215, y: 16 },
      { x: 222, y: 76, type: 'pass' },
      { x: 296, y: 58, type: 'pass' },
      { x: 348, y: 108, type: 'shot' }
    ],
    zones: [{ cx: 296, cy: 58, r: 16 }]
  }
];

const FUTSAL_DEFENSE_PLAYS = [
  {
    name: 'Defensa de Córner (Marcaje Mixto y Despeje)',
    steps: [
      'El Portero (1) y el Cierre (idx 1) cierran el primer palo y la línea de pase raso.',
      'Las Alas (idx 2 y 3) toman marcas individuales en el corazón del área.',
      'El Cierre anticipa el centro en el primer palo y lanza el contragolpe con el Pívot (idx 4).'
    ],
    movements: [
      { playerIndex: 0, startX: 22, startY: 102, endX: 24, endY: 106 },
      { playerIndex: 1, startX: 44, startY: 76, endX: 56, endY: 62 },
      { playerIndex: 2, startX: 62, startY: 105, endX: 74, endY: 96 },
      { playerIndex: 3, startX: 58, startY: 142, endX: 72, endY: 135 },
      { playerIndex: 4, startX: 115, startY: 115, endX: 215, endY: 110 }
    ],
    ballPath: [
      { x: 16, y: 18 },
      { x: 56, y: 62, type: 'pass' },
      { x: 215, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 56, cy: 62, r: 16 }]
  },
  {
    name: 'Defensa de Falta Frontal (Barrera y Achique)',
    steps: [
      'Las dos Alas (idx 2 y 3) arman la barrera firme a 5 metros protegiendo el palo.',
      'El Cierre (idx 1) vigila el pase corto al segundo palo.',
      'Apenas el rival toca en corto, el Ala (idx 2) salta a bloquear el tiro y despeja a campo rival.'
    ],
    movements: [
      { playerIndex: 0, startX: 22, startY: 114, endX: 24, endY: 112 },
      { playerIndex: 2, startX: 78, startY: 102, endX: 104, endY: 96 },
      { playerIndex: 3, startX: 78, startY: 116, endX: 82, endY: 116 },
      { playerIndex: 1, startX: 54, startY: 145, endX: 76, endY: 138 },
      { playerIndex: 4, startX: 135, startY: 72, endX: 225, endY: 64 }
    ],
    ballPath: [
      { x: 112, y: 108 },
      { x: 104, y: 96, type: 'pass' },
      { x: 225, y: 64, type: 'shot' }
    ],
    zones: [{ cx: 104, cy: 96, r: 16 }]
  },
  {
    name: 'Presión en Salida Rival (Bloqueo de Líneas de Pase)',
    steps: [
      'El Pívot (idx 4) curva su carrera para tapar al central derecho y encerrar al sacador.',
      'Las Alas (idx 2 y 3) adelantan 15 metros para saltar sobre los pases de banda.',
      'El Ala izquierda (idx 2) intercepta el pase forzado y define directo al arco.'
    ],
    movements: [
      { playerIndex: 4, startX: 235, startY: 110, endX: 292, endY: 92 },
      { playerIndex: 2, startX: 195, startY: 55, endX: 264, endY: 48 },
      { playerIndex: 3, startX: 195, startY: 165, endX: 255, endY: 158 },
      { playerIndex: 1, startX: 135, startY: 110, endX: 195, endY: 105 }
    ],
    ballPath: [
      { x: 315, y: 78 },
      { x: 264, y: 48, type: 'pass' },
      { x: 348, y: 108, type: 'shot' }
    ],
    zones: [{ cx: 264, cy: 48, r: 16 }]
  }
];

const FIELD_ATTACK_PLAYS = [
  {
    name: 'Tiro de Esquina (Arrastre al Primer Palo)',
    steps: [
      'El cobrador se ubica en el banderín de córner derecho junto al balón (⚽).',
      'El Delantero (9) ataca el primer palo arrastrando a la defensa.',
      'El segundo atacante entra de frente al punto penal, cabecea el centro y anota.'
    ],
    movements: [
      { playerIndex: -2, startX: 344, startY: 18, endX: 334, endY: 28 },
      { playerIndex: -1, startX: 282, startY: 118, endX: 326, endY: 72 },
      { playerIndex: -3, startX: 228, startY: 135, endX: 306, endY: 106 },
      { playerIndex: 1, startX: 205, startY: 78, endX: 278, endY: 88 }
    ],
    ballPath: [
      { x: 344, y: 18 },
      { x: 306, y: 106, type: 'pass' },
      { x: 348, y: 112, type: 'shot' }
    ],
    zones: [{ cx: 306, cy: 106, r: 17 }]
  },
  {
    name: 'Córner (Cortina al Segundo Palo)',
    steps: [
      'Cobro de esquina desde la derecha hacia la zona pasada del área.',
      'Dos jugadores bloquean y arrastran marcas hacia el primer palo.',
      'El defensor/interior entra por el segundo palo libre de marca para definir.'
    ],
    movements: [
      { playerIndex: -2, startX: 344, startY: 18, endX: 332, endY: 30 },
      { playerIndex: -1, startX: 292, startY: 96, endX: 325, endY: 68 },
      { playerIndex: -3, startX: 235, startY: 162, endX: 316, endY: 152 },
      { playerIndex: 1, startX: 210, startY: 110, endX: 268, endY: 112 }
    ],
    ballPath: [
      { x: 344, y: 18 },
      { x: 316, y: 152, type: 'pass' },
      { x: 348, y: 116, type: 'shot' }
    ],
    zones: [{ cx: 316, cy: 152, r: 17 }]
  },
  {
    name: 'Tiro Libre Frontal (Pared y Remate)',
    steps: [
      'Dos volantes se paran frente a la pelota en la frontal del área.',
      'El delantero pica al costado de la barrera habilitado.',
      'Toque corto filtrado al desmarque y remate cruzado de primera.'
    ],
    movements: [
      { playerIndex: -2, startX: 246, startY: 112, endX: 242, endY: 112 },
      { playerIndex: -3, startX: 248, startY: 92, endX: 304, endY: 72 },
      { playerIndex: -1, startX: 288, startY: 126, endX: 320, endY: 132 }
    ],
    ballPath: [
      { x: 246, y: 112 },
      { x: 304, y: 72, type: 'pass' },
      { x: 348, y: 106, type: 'shot' }
    ],
    zones: [{ cx: 304, cy: 72, r: 16 }]
  },
  {
    name: 'Tiro Libre Lateral (Centro Pasado)',
    steps: [
      'Tiro libre desde banda izquierda en tres cuartos de cancha.',
      'La línea de atacantes sostiene el fuera de juego en el borde del área.',
      'Centro pasado al segundo palo para bajarla al medio donde define el 9.'
    ],
    movements: [
      { playerIndex: -2, startX: 248, startY: 28, endX: 254, endY: 34 },
      { playerIndex: 1, startX: 245, startY: 145, endX: 318, endY: 154 },
      { playerIndex: -1, startX: 255, startY: 108, endX: 318, endY: 110 },
      { playerIndex: -3, startX: 248, startY: 75, endX: 308, endY: 78 }
    ],
    ballPath: [
      { x: 248, y: 28 },
      { x: 318, y: 154, type: 'pass' },
      { x: 318, y: 110, type: 'pass' },
      { x: 348, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 318, cy: 110, r: 17 }]
  },
  {
    name: 'Saque de Banda Ofensivo (Triangulación)',
    steps: [
      'El jugador de banda saca hacia el delantero que viene en apoyo.',
      'El delantero aguanta de espaldas y descarga de cara al volante interior.',
      'El volante filtra al espacio para la diagonal del atacante que define.'
    ],
    movements: [
      { playerIndex: -2, startX: 262, startY: 16, endX: 320, endY: 54 },
      { playerIndex: -1, startX: 295, startY: 82, endX: 284, endY: 66 },
      { playerIndex: -3, startX: 222, startY: 92, endX: 252, endY: 82 }
    ],
    ballPath: [
      { x: 262, y: 16 },
      { x: 284, y: 66, type: 'pass' },
      { x: 252, y: 82, type: 'pass' },
      { x: 320, y: 54, type: 'pass' },
      { x: 348, y: 106, type: 'shot' }
    ],
    zones: [{ cx: 320, cy: 54, r: 16 }]
  }
];

const FIELD_DEFENSE_PLAYS = [
  {
    name: 'Defensa de Córner (Marcaje Mixto y Despeje)',
    steps: [
      'Defensas posicionados en zona en el primer palo y punto penal.',
      'El central principal ataca la pelota en su punto más alto y despeja.',
      'El delantero descolgado recibe en mitad de cancha para iniciar la contra.'
    ],
    movements: [
      { playerIndex: 0, startX: 20, startY: 108, endX: 24, endY: 106 },
      { playerIndex: 1, startX: 42, startY: 78, endX: 54, endY: 66 },
      { playerIndex: 2, startX: 48, startY: 110, endX: 60, endY: 102 },
      { playerIndex: 3, startX: 46, startY: 142, endX: 58, endY: 136 },
      { playerIndex: -1, startX: 145, startY: 110, endX: 235, endY: 110 }
    ],
    ballPath: [
      { x: 16, y: 18 },
      { x: 54, y: 66, type: 'pass' },
      { x: 235, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 54, cy: 66, r: 17 }]
  },
  {
    name: 'Defensa de Falta Frontal (Barrera y Achique)',
    steps: [
      'Los volantes conforman la barrera cubriendo el primer palo del arquero.',
      'La línea defensiva se mantiene en el borde del área grande lista para achicar.',
      'Al cobro rival, la barrera bloquea/despeja y todo el bloque achica hacia adelante.'
    ],
    movements: [
      { playerIndex: 0, startX: 22, startY: 114, endX: 24, endY: 112 },
      { playerIndex: 1, startX: 58, startY: 75, endX: 84, endY: 75 },
      { playerIndex: 2, startX: 58, startY: 112, endX: 84, endY: 112 },
      { playerIndex: 3, startX: 82, startY: 98, endX: 106, endY: 96 },
      { playerIndex: -1, startX: 155, startY: 110, endX: 240, endY: 95 }
    ],
    ballPath: [
      { x: 116, y: 104 },
      { x: 106, y: 96, type: 'pass' },
      { x: 240, y: 95, type: 'shot' }
    ],
    zones: [{ cx: 106, cy: 96, r: 16 }]
  },
  {
    name: 'Presión en Salida Rival (Bloqueo de Líneas de Pase)',
    steps: [
      'El delantero centro (9) presiona en arco cerrando el pase entre centrales.',
      'Los volantes/extremos saltan sobre el lateral receptor en banda.',
      'Robo en tres cuartos de cancha y pase directo de definición.'
    ],
    movements: [
      { playerIndex: -1, startX: 240, startY: 110, endX: 296, endY: 96 },
      { playerIndex: -2, startX: 210, startY: 52, endX: 272, endY: 46 },
      { playerIndex: -3, startX: 205, startY: 162, endX: 262, endY: 152 },
      { playerIndex: 1, startX: 125, startY: 85, endX: 172, endY: 85 }
    ],
    ballPath: [
      { x: 315, y: 72 },
      { x: 272, y: 46, type: 'pass' },
      { x: 296, y: 96, type: 'pass' },
      { x: 348, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 272, cy: 46, r: 16 }]
  }
];

function getSetPiecesForCurrentSelection() {
  if (state.setPieceCategory === 'free') {
    return [];
  }
  const isFutsal = state.modality === 'Futsal';
  if (state.setPieceCategory === 'attack') {
    return isFutsal ? FUTSAL_ATTACK_PLAYS : FIELD_ATTACK_PLAYS;
  }
  return isFutsal ? FUTSAL_DEFENSE_PLAYS : FIELD_DEFENSE_PLAYS;
}

/* ==========================================================================
   Reference Coach / Manager Resolver by Modality + Formation + Play Style
   ========================================================================== */
function resolveReferenceCoach(modality, formationCode, playStyle) {
  // 1. Direct Futsal Reference Coaches
  if (modality === 'Futsal') {
    if (formationCode.startsWith('1-4-0') || playStyle.includes('Rotación')) {
      return {
        name: 'Jesús Velasco / Marquinhos Xavier (Selección de Brasil)',
        badge: 'Referente Directo Futsal',
        isAdapted: false,
        note: 'Maestros del 1-4-0 con rotación continua de cuatro universales, cortes a la espalda y movilidad total sin pívot fijo.'
      };
    }
    if (formationCode.startsWith('5-0')) {
      return {
        name: 'Tino Pérez / Kaka (Especialistas en 5v4)',
        badge: 'Referente Directo Futsal',
        isAdapted: false,
        note: 'Referentes en circulación paciente con Portero-Jugador para hundir el rombo defensivo rival y definir en el segundo palo.'
      };
    }
    if (formationCode.startsWith('1-2-2') || playStyle.includes('Bloque Bajo')) {
      return {
        name: 'Jorge Braz (Selección de Portugal) / Diego Giustozzi',
        badge: 'Referente Directo Futsal',
        isAdapted: false,
        note: 'Campeones del mundo utilizando el cuadrado 1-2-2 con orden defensivo férreo, duelos 1v1 en ala y transiciones letales.'
      };
    }
    if (playStyle.includes('Presión Alta') || formationCode.includes('Presión Alta')) {
      return {
        name: 'Matías Lucuix (Selección Argentina) / Duda',
        badge: 'Referente Directo Futsal',
        isAdapted: false,
        note: 'Presión asfixiante en primera línea sobre el cierre rival y ayudas inmediatas para robar en cancha contraria.'
      };
    }
    return {
      name: 'Venancio López / Jesús Velasco (Escuela Española)',
      badge: 'Referente Directo Futsal',
      isAdapted: false,
      note: 'Referentes históricos del 1-3-1 en rombo conectando con el pívot de espaldas y llegada explosiva de las alas.'
    };
  }

  // 2. Determine core tactical coach archetype (Fútbol 11 & adapted for Fútbol 7 / Fútbol 9)
  const isAdapted = modality === 'Fútbol 7' || modality === 'Fútbol 9';
  const badgeText = isAdapted
    ? 'Referente adaptado de Fútbol 11 / Futsal'
    : 'Referente Directo Fútbol 11';
  const adaptedPrefix = isAdapted
    ? `Idea táctica de Fútbol 11 adaptada a las dimensiones de ${modality}: `
    : '';

  if (formationCode.includes('1-5-3-2') || formationCode.includes('1-4-1-1') || playStyle.includes('Bloque Bajo')) {
    return {
      name: 'Diego "Cholo" Simeone / José Mourinho',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Bloque corto e impenetrable cerca de su área, ayudas solidarias por dentro y contragolpe vertical al espacio.`
    };
  }
  if (formationCode.includes('1-3-5-2') || (formationCode.includes('1-3-3-2') && !playStyle.includes('Posesión'))) {
    return {
      name: 'Simone Inzaghi (Inter) / Antonio Conte',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Salida limpia con tres centrales, carrileros profundos de banda a banda y dos delanteros que combinan de memoria.`
    };
  }
  if (formationCode.includes('1-3-4-3') || formationCode.includes('1-3-2-3') || formationCode.includes('1-3-3')) {
    return {
      name: 'Xabi Alonso (Leverkusen) / Thomas Tuchel',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Amplitud total con carrileros altos, doble pivote asociativo y presión inmediata tras pérdida en campo rival.`
    };
  }
  if (formationCode.includes('Rombo') || formationCode.includes('Árbol') || formationCode.includes('1-4-3-2-1') || formationCode.includes('1-4-2-3-1')) {
    return {
      name: 'Carlo Ancelotti / Zinedine Zidane',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Superioridad técnica por el carril central con mediapuntas libres, equilibrio del pivote y transiciones rápidas.`
    };
  }
  if (playStyle.includes('Presión Alta') || playStyle.includes('Directo')) {
    return {
      name: 'Jürgen Klopp / Hansi Flick',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Gegenpressing puro: línea defensiva adelantada, recuperación en menos de 5 segundos y ataques verticales.`
    };
  }
  return {
    name: 'Pep Guardiola / Luis Enrique',
    badge: badgeText,
    isAdapted,
    note: `${adaptedPrefix}Juego de posición, salida limpia desde el arquero, triángulos en las bandas y superioridad en el mediocampo.`
  };
}

// DOM References
const dom = {
  tabBtnAssistant: document.getElementById('tab-btn-assistant'),
  tabBtnBoard: document.getElementById('tab-btn-board'),
  tabBtnSquad: document.getElementById('tab-btn-squad'),
  viewAssistant: document.getElementById('view-assistant'),
  viewBoard: document.getElementById('view-board'),
  viewSquad: document.getElementById('view-squad'),
  backendStatusBtn: document.getElementById('backend-status-btn'),
  backendStatusText: document.getElementById('backend-status-text'),
  shutdownSystemBtn: document.getElementById('shutdown-system-btn'),
  headerModalityBadge: document.getElementById('header-modality-badge'),
  playersCountTag: document.getElementById('players-count-tag'),
  modalitySelector: document.getElementById('modality-selector'),
  sidebarFormationLabel: document.getElementById('sidebar-formation-label'),
  sidebarStyleLabel: document.getElementById('sidebar-style-label'),
  sidebarSquadLabel: document.getElementById('sidebar-squad-label'),
  goToBoardBtn: document.getElementById('go-to-board-btn'),
  goToSquadBtn: document.getElementById('go-to-squad-btn'),
  syncWikiBtn: document.getElementById('sync-wiki-btn'),
  boardModalityPills: document.getElementById('board-modality-pills'),
  formationSelect: document.getElementById('formation-select'),
  styleSelect: document.getElementById('style-select'),
  setpieceCategorySelect: document.getElementById('setpiece-category-select'),
  setpieceSelect: document.getElementById('setpiece-select'),
  boardPitchTitle: document.getElementById('board-pitch-title'),
  boardStyleBadge: document.getElementById('board-style-badge'),
  formationBadge: document.getElementById('formation-badge'),
  formationFullText: document.getElementById('formation-full-text'),
  toggleVariantBtn: document.getElementById('toggle-variant-btn'),
  setpiecePlaybackControls: document.getElementById('setpiece-playback-controls'),
  playSetpieceBtn: document.getElementById('play-setpiece-btn'),
  nextStepSetpieceBtn: document.getElementById('next-step-setpiece-btn'),
  resetSetpieceBtn: document.getElementById('reset-setpiece-btn'),
  setpieceLiveBanner: document.getElementById('setpiece-live-banner'),
  liveStepBadge: document.getElementById('live-step-badge'),
  liveStepText: document.getElementById('live-step-text'),
  pitchTokens: document.getElementById('pitch-tokens'),
  ballToken: document.getElementById('ball-token'),
  synergyLinks: document.getElementById('synergy-links'),
  setpieceOverlay: document.getElementById('setpiece-overlay'),
  tacticOverviewText: document.getElementById('tactic-overview-text'),
  coachOriginBadge: document.getElementById('coach-origin-badge'),
  coachNameText: document.getElementById('coach-name-text'),
  coachNoteText: document.getElementById('coach-note-text'),
  setpieceStepsBox: document.getElementById('setpiece-steps-box'),
  setpieceTitleText: document.getElementById('setpiece-title-text'),
  setpieceStepsList: document.getElementById('setpiece-steps-list'),
  roleDefenseText: document.getElementById('role-defense-text'),
  roleMidfieldText: document.getElementById('role-midfield-text'),
  roleAttackText: document.getElementById('role-attack-text'),
  styleEffectDescription: document.getElementById('style-effect-description'),
  analyzeWithBotBtn: document.getElementById('analyze-with-bot-btn'),
  exportMatchPlanBoardBtn: document.getElementById('export-match-plan-board-btn'),
  exportMatchPlanSquadBtn: document.getElementById('export-match-plan-squad-btn'),
  printableMatchPlan: document.getElementById('printable-match-plan'),
  // Tab 3 DOM References
  loadDemoSquadBtn: document.getElementById('load-demo-squad-btn'),
  clearSquadBtn: document.getElementById('clear-squad-btn'),
  addPlayerForm: document.getElementById('add-player-form'),
  playerNameInput: document.getElementById('player-name-input'),
  playerNumberInput: document.getElementById('player-number-input'),
  playerPosSelect: document.getElementById('player-pos-select'),
  playerFootSelect: document.getElementById('player-foot-select'),
  statPace: document.getElementById('stat-pace'),
  statPassing: document.getElementById('stat-passing'),
  statDribbling: document.getElementById('stat-dribbling'),
  statDefending: document.getElementById('stat-defending'),
  statShooting: document.getElementById('stat-shooting'),
  statVision: document.getElementById('stat-vision'),
  valPace: document.getElementById('val-pace'),
  valPassing: document.getElementById('val-passing'),
  valDribbling: document.getElementById('val-dribbling'),
  valDefending: document.getElementById('val-defending'),
  valShooting: document.getElementById('val-shooting'),
  valVision: document.getElementById('val-vision'),
  squadCountBadge: document.getElementById('squad-count-badge'),
  squadRosterList: document.getElementById('squad-roster-list'),
  squadModalitySelect: document.getElementById('squad-modality-select'),
  squadFormationSelect: document.getElementById('squad-formation-select'),
  squadStyleSelect: document.getElementById('squad-style-select'),
  generateIdealSquadBtn: document.getElementById('generate-ideal-squad-btn'),
  idealSquadBanner: document.getElementById('ideal-squad-banner'),
  idealBannerTitle: document.getElementById('ideal-banner-title'),
  idealBannerText: document.getElementById('ideal-banner-text'),
  idealBannerPartners: document.getElementById('ideal-banner-partners'),
  closeIdealBannerBtn: document.getElementById('close-ideal-banner-btn'),
  squadGlobalSynergy: document.getElementById('squad-global-synergy'),
  squadPitchTokens: document.getElementById('squad-pitch-tokens'),
  squadSynergyLinks: document.getElementById('squad-synergy-links'),
  squadBenchSection: document.getElementById('squad-bench-section'),
  squadBenchList: document.getElementById('squad-bench-list'),
  benchCountBadge: document.getElementById('bench-count-badge'),
  resetLineupBtn: document.getElementById('reset-lineup-btn'),
  exportSquadToBoardBtn: document.getElementById('export-squad-to-board-btn'),
  askBotAboutSquadBtn: document.getElementById('ask-bot-about-squad-btn'),
  compSimilarityBadge: document.getElementById('comp-similarity-badge'),
  compPlayerNumber: document.getElementById('comp-player-number'),
  compPlayerName: document.getElementById('comp-player-name'),
  compPlayerMeta: document.getElementById('comp-player-meta'),
  compMirrorBadge: document.getElementById('comp-mirror-badge'),
  compCrackName: document.getElementById('comp-crack-name'),
  compCrackStyle: document.getElementById('comp-crack-style'),
  compCrackWiki: document.getElementById('comp-crack-wiki'),
  compWhyText: document.getElementById('comp-why-text'),
  compPotentiateText: document.getElementById('comp-potentiate-text'),
  compPartnersChips: document.getElementById('comp-partners-chips'),
  // PDF & Chat
  pdfUploadForm: document.getElementById('pdf-upload-form'),
  dropZone: document.getElementById('drop-zone'),
  pdfFileInput: document.getElementById('pdf-file-input'),
  dropTitle: document.getElementById('drop-title'),
  uploadModalityLabel: document.getElementById('upload-modality-label'),
  uploadProgressBox: document.getElementById('upload-progress-box'),
  uploadFilename: document.getElementById('upload-filename'),
  uploadStatusPct: document.getElementById('upload-status-pct'),
  tenantInput: document.getElementById('tenant-input'),
  uploadSubmitBtn: document.getElementById('upload-submit-btn'),
  indexedCountBadge: document.getElementById('indexed-count-badge'),
  indexedDocsList: document.getElementById('indexed-docs-list'),
  quickPrompts: document.getElementById('quick-prompts'),
  chatMessages: document.getElementById('chat-messages'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  inputModalityTag: document.getElementById('input-modality-tag'),
  sendChatBtn: document.getElementById('send-chat-btn'),
  clearChatBtn: document.getElementById('clear-chat-btn'),
  toastContainer: document.getElementById('toast-container')
};

/* ==========================================================================
   1. Tab Navigation (Assistant vs Tactical Board vs Custom Squad)
   ========================================================================== */
function switchTab(tabName) {
  state.activeTab = tabName;
  const isAssistant = tabName === 'assistant';
  const isBoard = tabName === 'board';
  const isSquad = tabName === 'squad';

  dom.tabBtnAssistant.classList.toggle('active', isAssistant);
  dom.tabBtnAssistant.setAttribute('aria-selected', String(isAssistant));
  dom.tabBtnBoard.classList.toggle('active', isBoard);
  dom.tabBtnBoard.setAttribute('aria-selected', String(isBoard));
  if (dom.tabBtnSquad) {
    dom.tabBtnSquad.classList.toggle('active', isSquad);
    dom.tabBtnSquad.setAttribute('aria-selected', String(isSquad));
  }

  dom.viewAssistant.classList.toggle('active-view', isAssistant);
  dom.viewAssistant.classList.toggle('hidden-view', !isAssistant);
  dom.viewBoard.classList.toggle('active-view', isBoard);
  dom.viewBoard.classList.toggle('hidden-view', !isBoard);
  if (dom.viewSquad) {
    dom.viewSquad.classList.toggle('active-view', isSquad);
    dom.viewSquad.classList.toggle('hidden-view', !isSquad);
  }

  if (isBoard) {
    requestAnimationFrame(() => renderTacticalPitch());
  } else if (isSquad) {
    requestAnimationFrame(() => refreshSquadAndOptimize());
  }
}

/* ==========================================================================
   2. Backend Health Check & Wikipedia Sync
   ========================================================================== */
async function checkBackendHealth() {
  dom.backendStatusBtn.className = 'status-badge checking';
  dom.backendStatusText.textContent = 'Conectando a :8000...';

  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    dom.backendStatusBtn.className = 'status-badge online';
    dom.backendStatusText.textContent = `${data.service || 'Spring Boot API'} · Online`;
  } catch (err) {
    dom.backendStatusBtn.className = 'status-badge offline';
    dom.backendStatusText.textContent = 'Backend 8000 Offline';
  }
}

async function syncWikipediaKnowledge() {
  if (!dom.syncWikiBtn) return;
  dom.syncWikiBtn.disabled = true;
  dom.syncWikiBtn.textContent = '⏳ Sincronizando...';

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/tactical/sync-external`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al sincronizar Wikipedia');

    const count = data.chunksSaved ?? data.chunksInDatabase ?? 0;
    showToast(
      'Conocimiento Wikipedia Sincronizado',
      `Base vectorial lista con ${count} fragmentos tácticos bajo namespace 'api-externa'.`,
      'success'
    );
  } catch (err) {
    showToast('Error en Sync Wikipedia', err.message, 'error');
  } finally {
    dom.syncWikiBtn.disabled = false;
    dom.syncWikiBtn.textContent = '🌐 Sync Wikipedia';
  }
}

/* ==========================================================================
   3. Toast Notifications
   ========================================================================== */
function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-title">${escapeHtml(title)}</span>
    <span>${escapeHtml(message)}</span>
  `;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

/* ==========================================================================
   4. Dynamic Tactical Pitch, Coach Card & Set Pieces Overlay
   ========================================================================== */
function clearPlaybackTimers() {
  while (state.playbackTimers.length > 0) {
    clearTimeout(state.playbackTimers.pop());
  }
  while (state.motionBlurTimers.length > 0) {
    clearTimeout(state.motionBlurTimers.pop());
  }
}

function triggerMotionBlurOnElements(elements, durationMs = 1220) {
  elements.forEach((el) => {
    if (!el) return;
    el.classList.add('is-moving');
    const t = setTimeout(() => {
      el.classList.remove('is-moving');
    }, durationMs);
    state.motionBlurTimers.push(t);
  });
}

function getActiveFormationSetup() {
  const list = FORMATIONS_BY_MODALITY[state.modality] || FORMATIONS_BY_MODALITY['Futsal'];
  return list[state.formationIndex % list.length];
}

function getActiveSetPiece() {
  const list = getSetPiecesForCurrentSelection();
  if (!list || list.length === 0) {
    return null;
  }
  return list[state.setPieceIndex % list.length];
}

function populateFormationDropdown() {
  const list = FORMATIONS_BY_MODALITY[state.modality] || FORMATIONS_BY_MODALITY['Futsal'];
  dom.formationSelect.innerHTML = list
    .map((item, idx) => `<option value="${idx}" ${idx === state.formationIndex ? 'selected' : ''}>${escapeHtml(item.code)}</option>`)
    .join('');
}

function populateSetPieceDropdown() {
  if (!dom.setpieceSelect) return;
  const list = getSetPiecesForCurrentSelection();

  if (state.setPieceCategory === 'free' || list.length === 0) {
    dom.setpieceSelect.disabled = true;
    dom.setpieceSelect.innerHTML = '<option value="0">Posicional en cancha (Sin balón parado)</option>';
    return;
  }

  dom.setpieceSelect.disabled = false;
  const icon = state.setPieceCategory === 'attack' ? '⚔️ ' : '🛡️ ';
  dom.setpieceSelect.innerHTML = list
    .map((item, idx) => `<option value="${idx}" ${idx === state.setPieceIndex ? 'selected' : ''}>${icon}${escapeHtml(item.name)}</option>`)
    .join('');
}

function updateContextBadges() {
  const setup = getActiveFormationSetup();
  dom.headerModalityBadge.textContent = `${state.modality} · ${setup.code}`;
  dom.inputModalityTag.textContent = `${state.modality} · ${setup.code.split(' ')[0]}`;
  dom.sidebarFormationLabel.textContent = setup.code;
  dom.sidebarStyleLabel.textContent = state.playStyle;
  if (dom.uploadModalityLabel) {
    dom.uploadModalityLabel.textContent = state.modality;
  }
  if (dom.sidebarSquadLabel) {
    const count = state.squadPlayers.length;
    dom.sidebarSquadLabel.textContent = count > 0
      ? `${count} jugadores en PostgreSQL`
      : 'PostgreSQL + Top 100 Activa';
  }
}

function resolvePlayerIndex(rawIdx, totalPlayers) {
  if (rawIdx < 0) {
    return Math.max(1, totalPlayers + rawIdx);
  }
  return Math.min(totalPlayers - 1, rawIdx);
}

function positionBallToken(x, y, visible = true, animateBlur = false) {
  if (!dom.ballToken) return;
  if (!visible) {
    dom.ballToken.classList.add('hidden');
    dom.ballToken.classList.remove('is-moving');
    return;
  }
  const pitchWidth = dom.pitchTokens.clientWidth || 720;
  const pitchHeight = dom.pitchTokens.clientHeight || 430;
  const scaleX = pitchWidth / 360;
  const scaleY = pitchHeight / 220;
  dom.ballToken.classList.remove('hidden');
  const tx = Math.round(x * scaleX);
  const ty = Math.round(y * scaleY);
  const scaleVal = animateBlur ? 1.08 : 1;
  dom.ballToken.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleVal})`;

  if (animateBlur) {
    triggerMotionBlurOnElements([dom.ballToken], 1180);
    const tScale = setTimeout(() => {
      dom.ballToken.style.transform = `translate(${tx}px, ${ty}px) scale(1)`;
    }, 1180);
    state.motionBlurTimers.push(tScale);
  }
}

function resolveActiveStartersForStepFormatting(targetModality = state.modality, setup = getActiveFormationSetup()) {
  if (
    state.exportedBoardLineup &&
    state.exportedBoardLineup.modality === targetModality &&
    Array.isArray(state.exportedBoardLineup.starters)
  ) {
    return state.exportedBoardLineup.starters;
  }
  if (
    state.squadOptimization &&
    state.squadOptimization.modality === targetModality &&
    Array.isArray(state.squadOptimization.lineup)
  ) {
    return state.squadOptimization.lineup;
  }
  return null;
}

function formatSetPieceStepText(rawStep, setup = getActiveFormationSetup(), startersOverride = null, targetModality = state.modality) {
  if (!rawStep) return '';
  const starters = startersOverride || resolveActiveStartersForStepFormatting(targetModality, setup);
  const players = setup?.players || [];

  const getPlayerLabelAt = (idx) => {
    const resolvedIdx = resolvePlayerIndex(idx, players.length || 5);
    const assigned = starters?.[resolvedIdx];
    if (assigned && assigned.assigned && assigned.playerId && assigned.name) {
      return `(${assigned.name} #${assigned.jerseyNumber})`;
    }
    const slot = players[resolvedIdx];
    if (slot) {
      return `(#${slot.num} · ${slot.role})`;
    }
    return '';
  };

  let formatted = String(rawStep);

  // Reemplazar patrones compuestos como "(idx 2 y 3)"
  formatted = formatted.replace(/\(idx\s+(\d+)\s+y\s+(\d+)\)/gi, (_, i1, i2) => {
    const idx1 = Number(i1);
    const idx2 = Number(i2);
    const a1 = starters?.[idx1];
    const a2 = starters?.[idx2];
    if (a1?.assigned && a1?.name && a2?.assigned && a2?.name) {
      return `(${a1.name} #${a1.jerseyNumber} y ${a2.name} #${a2.jerseyNumber})`;
    }
    const s1 = players[idx1];
    const s2 = players[idx2];
    if (s1 && s2) {
      return `(#${s1.num} ${s1.role} y #${s2.num} ${s2.role})`;
    }
    return '';
  });

  // Reemplazar patrones individuales como "(idx 1)", "(idx 2)", "(idx 3)", "(idx 4)"
  formatted = formatted.replace(/\(idx\s+(-?\d+)\)/gi, (_, i1) => {
    return getPlayerLabelAt(Number(i1));
  });

  return formatted.replace(/\s{2,}/g, ' ').trim();
}

function updateLiveStepHighlight(setPiece, stepNumber) {
  if (!setPiece || !dom.setpieceStepsList) return;
  const items = Array.from(dom.setpieceStepsList.querySelectorAll('li'));
  items.forEach((li, idx) => {
    li.classList.toggle('active-step', idx === stepNumber - 1);
  });

  if (!dom.setpieceLiveBanner) return;
  if (stepNumber <= 0 || stepNumber > setPiece.steps.length) {
    dom.setpieceLiveBanner.classList.add('hidden');
    return;
  }

  dom.setpieceLiveBanner.classList.remove('hidden');
  dom.liveStepBadge.textContent = `Paso ${stepNumber}/${setPiece.steps.length}`;
  dom.liveStepText.textContent = formatSetPieceStepText(setPiece.steps[stepNumber - 1]);
}

function renderSetPieceOverlay(setPiece, totalPlayers) {
  if (!dom.setpieceOverlay) return;
  dom.setpieceOverlay.innerHTML = '';

  if (!setPiece) {
    if (dom.setpieceStepsBox) dom.setpieceStepsBox.classList.add('hidden');
    if (dom.setpiecePlaybackControls) dom.setpiecePlaybackControls.classList.add('hidden');
    positionBallToken(0, 0, false);
    return;
  }

  if (dom.setpiecePlaybackControls) {
    dom.setpiecePlaybackControls.classList.remove('hidden');
  }

  // Show step-by-step instructions box in right panel
  if (dom.setpieceStepsBox) {
    dom.setpieceStepsBox.classList.remove('hidden');
    const catBadge = state.setPieceCategory === 'attack' ? '⚔️ Ataque: ' : '🛡️ Defensa: ';
    dom.setpieceTitleText.textContent = catBadge + setPiece.name;
    const activeSetup = getActiveFormationSetup();
    dom.setpieceStepsList.innerHTML = setPiece.steps
      .map((step) => `<li>${escapeHtml(formatSetPieceStepText(step, activeSetup))}</li>`)
      .join('');
  }

  // Draw target strike / interception zones on SVG pitch
  (setPiece.zones || []).forEach((z) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', z.cx);
    circle.setAttribute('cy', z.cy);
    circle.setAttribute('r', z.r);
    circle.setAttribute('fill', 'rgba(244, 63, 94, 0.16)');
    circle.setAttribute('stroke', '#f43f5e');
    circle.setAttribute('stroke-width', '1.4');
    circle.setAttribute('stroke-dasharray', '3 3');
    dom.setpieceOverlay.appendChild(circle);
  });

  // 1. Draw player run arrows directly from their actual startX/startY to endX/endY
  (setPiece.movements || []).forEach((mv) => {
    const dist = Math.hypot(mv.endX - mv.startX, mv.endY - mv.startY);
    if (dist < 6) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', mv.startX);
    line.setAttribute('y1', mv.startY);
    line.setAttribute('x2', mv.endX);
    line.setAttribute('y2', mv.endY);
    line.setAttribute('stroke', 'rgba(56, 189, 248, 0.72)');
    line.setAttribute('stroke-width', '1.8');
    line.setAttribute('stroke-dasharray', '5 4');
    line.setAttribute('marker-end', 'url(#arrow-run)');
    dom.setpieceOverlay.appendChild(line);
  });

  // 2. Draw ball trajectory (pass & shot segments)
  const bp = setPiece.ballPath || [];
  for (let i = 0; i < bp.length - 1; i++) {
    const from = bp[i];
    const to = bp[i + 1];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);

    if (to.type === 'shot') {
      line.setAttribute('stroke', 'rgba(244, 63, 94, 0.85)');
      line.setAttribute('stroke-width', '2.4');
      line.setAttribute('marker-end', 'url(#arrow-shot)');
    } else {
      line.setAttribute('stroke', 'rgba(251, 191, 36, 0.85)');
      line.setAttribute('stroke-width', '2.1');
      line.setAttribute('marker-end', 'url(#arrow-pass)');
    }
    dom.setpieceOverlay.appendChild(line);
  }
}

function executeSetPieceStep(stepNum) {
  const activeSetPiece = getActiveSetPiece();
  if (!activeSetPiece) return;

  const totalSteps = activeSetPiece.steps.length || 3;
  state.setPieceStep = Math.max(0, Math.min(totalSteps, stepNum));
  renderTacticalPitch(true);
  updateLiveStepHighlight(activeSetPiece, state.setPieceStep);

  const bp = activeSetPiece.ballPath || [];
  if (bp.length === 0) return;

  if (state.setPieceStep <= 1) {
    // Paso 1: Cobrador perfilado junto al balón
    positionBallToken(bp[0].x, bp[0].y, true, false);
  } else if (state.setPieceStep === 2) {
    // Paso 2: Primer pase / centro hacia el receptor desmarcado
    const targetPt = bp[Math.min(1, bp.length - 1)];
    positionBallToken(targetPt.x, targetPt.y, true, true);
  } else {
    // Paso 3: Remate final al arco o despeje de contragolpe
    const finalPt = bp[bp.length - 1];
    positionBallToken(finalPt.x, finalPt.y, true, true);
  }
}

function playSetPieceAnimation() {
  const activeSetPiece = getActiveSetPiece();
  if (!activeSetPiece) return;

  clearPlaybackTimers();
  const totalSteps = activeSetPiece.steps.length || 3;
  const STEP_PAUSE_MS = 2500; // Pausa de 2.5 segundos en cada acción para lectura

  // Iniciar en Paso 1 inmediatamente
  executeSetPieceStep(1);

  for (let s = 2; s <= totalSteps; s++) {
    const timer = setTimeout(() => {
      executeSetPieceStep(s);
    }, (s - 1) * STEP_PAUSE_MS);
    state.playbackTimers.push(timer);
  }
}

function advanceNextSetPieceStep() {
  const activeSetPiece = getActiveSetPiece();
  if (!activeSetPiece) return;
  clearPlaybackTimers();
  const totalSteps = activeSetPiece.steps.length || 3;
  const nextStep = state.setPieceStep >= totalSteps ? 1 : state.setPieceStep + 1;
  executeSetPieceStep(nextStep);
}

function resetSetPieceToStart() {
  clearPlaybackTimers();
  state.setPieceStep = 1;
  executeSetPieceStep(1);
}

function renderTacticalPitch(animateMotionBlur = false) {
  const activeSetup = getActiveFormationSetup();
  const activeSetPiece = getActiveSetPiece();
  const styleMod = PLAY_STYLE_MODIFIERS[state.playStyle] || PLAY_STYLE_MODIFIERS['Posesión & Juego de Posición'];

  const hasExportedLineup =
    state.exportedBoardLineup &&
    state.exportedBoardLineup.modality === state.modality &&
    state.exportedBoardLineup.formationIndex === state.formationIndex &&
    Array.isArray(state.exportedBoardLineup.starters);

  dom.boardPitchTitle.textContent = hasExportedLineup
    ? `Pizarra Táctica · ${state.modality} (Tu Plantilla en Cancha)`
    : `Pizarra Táctica · ${state.modality}`;
  dom.boardStyleBadge.textContent = state.playStyle;
  dom.formationBadge.textContent = activeSetup.code;

  // Update Reference Coach Card
  const coachInfo = resolveReferenceCoach(state.modality, activeSetup.code, state.playStyle);
  if (dom.coachNameText) {
    dom.coachNameText.textContent = coachInfo.name;
    dom.coachOriginBadge.textContent = coachInfo.badge;
    dom.coachOriginBadge.classList.toggle('adapted', coachInfo.isAdapted);
    dom.coachNoteText.textContent = coachInfo.note;
  }

  // Update Line Functions Panel
  dom.tacticOverviewText.textContent = activeSetup.overview;
  dom.roleDefenseText.textContent = `${activeSetup.defenseRole} ${styleMod.defenseAddon}`;
  dom.roleMidfieldText.textContent = `${activeSetup.midfieldRole} ${styleMod.midfieldAddon}`;
  dom.roleAttackText.textContent = `${activeSetup.attackRole} ${styleMod.attackAddon}`;
  dom.styleEffectDescription.textContent = styleMod.effect;

  updateContextBadges();

  const pitchWidth = dom.pitchTokens.clientWidth || 720;
  const pitchHeight = dom.pitchTokens.clientHeight || 430;
  const scaleX = pitchWidth / 360;
  const scaleY = pitchHeight / 220;

  const existingTokens = Array.from(dom.pitchTokens.querySelectorAll('.player-token'));
  while (existingTokens.length > activeSetup.players.length) {
    existingTokens.pop().remove();
  }

  // Build map of player movements if a Set Piece is active (with movement rank for progressive steps)
  const actorMovementMap = new Map();
  if (activeSetPiece && Array.isArray(activeSetPiece.movements)) {
    activeSetPiece.movements.forEach((mv, orderIdx) => {
      const idx = resolvePlayerIndex(mv.playerIndex, activeSetup.players.length);
      actorMovementMap.set(idx, { ...mv, orderIdx });
    });
  }

  // Compute adjusted coordinates based on Play Style OR Progressive Set Piece Step (1, 2, 3)
  const adjustedCoords = activeSetup.players.map((p, idx) => {
    const actorMv = actorMovementMap.get(idx);
    if (actorMv) {
      let progress = 0;
      if (state.setPieceStep <= 1) {
        progress = 0; // Paso 1: Todos en su posición inicial de jugada preparada
      } else if (state.setPieceStep === 2) {
        // Paso 2: Los primeros desmarques/arrastres avanzan al 100%, el rematador final avanza a mitad de carrera
        progress = actorMv.orderIdx <= 1 ? 1 : 0.55;
      } else {
        // Paso 3: Todos completan su carrera de remate / cobertura final
        progress = 1;
      }
      const targetX = actorMv.startX + (actorMv.endX - actorMv.startX) * progress;
      const targetY = actorMv.startY + (actorMv.endY - actorMv.startY) * progress;
      return { ...p, adjX: targetX, adjY: targetY, isActor: true };
    }

    if (p.gk && activeSetup.code !== '5-0 (Portero-Jugador)') {
      return { ...p, adjX: p.x, adjY: p.y, isActor: false };
    }
    const rawX = p.x + styleMod.shiftX;
    const rawY = 110 + (p.y - 110) * styleMod.spreadY;
    const adjX = Math.max(28, Math.min(334, rawX));
    const adjY = Math.max(24, Math.min(196, rawY));
    return { ...p, adjX, adjY, isActor: false };
  });

  const movingElements = [];

  adjustedCoords.forEach((p, idx) => {
    let tokenEl = existingTokens[idx];
    if (!tokenEl) {
      tokenEl = document.createElement('div');
      tokenEl.className = 'player-token';
      tokenEl.style.transform = `translate(${180 * scaleX}px, ${110 * scaleY}px) scale(0.5)`;
      dom.pitchTokens.appendChild(tokenEl);
    }

    const exportedSlot = hasExportedLineup ? state.exportedBoardLineup.starters[idx] : null;
    const hasExportedPlayer = Boolean(exportedSlot && exportedSlot.assigned && exportedSlot.playerId);
    const tokenNum = hasExportedPlayer ? String(exportedSlot.jerseyNumber) : p.num;
    const tokenRoleLabel = hasExportedPlayer
      ? `${exportedSlot.name.split(' ')[0]} (${p.role})`
      : p.role;

    tokenEl.className = `player-token ${p.gk ? 'gk' : ''} ${p.isActor ? 'active-actor' : ''}`.trim();
    tokenEl.textContent = tokenNum;
    tokenEl.setAttribute('data-role', tokenRoleLabel);
    if (hasExportedPlayer) {
      tokenEl.title = `${exportedSlot.name} (#${exportedSlot.jerseyNumber} · ${p.role})`;
    } else {
      tokenEl.removeAttribute('title');
    }

    const prevX = Number(tokenEl.dataset.tx || 0);
    const prevY = Number(tokenEl.dataset.ty || 0);
    const tx = Math.round(p.adjX * scaleX);
    const ty = Math.round(p.adjY * scaleY);
    const movedDistance = Math.hypot(tx - prevX, ty - prevY);

    tokenEl.dataset.tx = String(tx);
    tokenEl.dataset.ty = String(ty);

    const shouldBlur = animateMotionBlur && movedDistance > 8;
    if (shouldBlur) {
      movingElements.push(tokenEl);
    }

    requestAnimationFrame(() => {
      const scaleVal = shouldBlur ? 1.06 : 1;
      tokenEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleVal})`;
      if (shouldBlur) {
        const tScale = setTimeout(() => {
          tokenEl.style.transform = `translate(${tx}px, ${ty}px) scale(1)`;
        }, 1220);
        state.motionBlurTimers.push(tScale);
      }
    });
  });

  if (movingElements.length > 0) {
    triggerMotionBlurOnElements(movingElements, 1220);
  }

  // Draw tactical synergy lines in SVG only during Free Play
  dom.synergyLinks.innerHTML = '';
  if (!activeSetPiece) {
    if (dom.setpieceLiveBanner) dom.setpieceLiveBanner.classList.add('hidden');
    (activeSetup.links || []).forEach(([fromIdx, toIdx]) => {
      const p1 = adjustedCoords[fromIdx];
      const p2 = adjustedCoords[toIdx];
      if (!p1 || !p2) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p1.adjX);
      line.setAttribute('y1', p1.adjY);
      line.setAttribute('x2', p2.adjX);
      line.setAttribute('y2', p2.adjY);
      dom.synergyLinks.appendChild(line);
    });
  }

  // Render Set Piece guide lines & target zone overlay
  renderSetPieceOverlay(activeSetPiece, activeSetup.players.length);
  if (activeSetPiece && state.setPieceStep > 0) {
    updateLiveStepHighlight(activeSetPiece, state.setPieceStep);
  }
}

/* ==========================================================================
   5. Modality Selection (Synchronized across both tabs)
   ========================================================================== */
function setModality(newModality, playersTag = null) {
  clearPlaybackTimers();
  state.modality = newModality;
  state.formationIndex = 0;
  state.setPieceIndex = 0;
  state.setPieceStep = 0;

  dom.modalitySelector.querySelectorAll('.modality-btn').forEach((btn) => {
    const isMatch = btn.dataset.modality === newModality;
    btn.classList.toggle('active', isMatch);
    if (isMatch && !playersTag) {
      playersTag = btn.dataset.players;
    }
  });

  dom.boardModalityPills.querySelectorAll('.board-mod-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.modality === newModality);
  });

  if (playersTag) {
    dom.playersCountTag.textContent = playersTag;
  }

  populateFormationDropdown();
  populateSetPieceDropdown();
  renderTacticalPitch(true);
  if (state.setPieceCategory !== 'free') {
    playSetPieceAnimation();
  }
}

/* ==========================================================================
   6. PDF Drag-and-Drop & Ingestion (POST /api/v1/documents/upload-pdf)
   ========================================================================== */
function handleSelectedPdfFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Archivo no válido', 'Por favor selecciona un documento con extensión .pdf', 'error');
    return;
  }
  state.selectedFile = file;
  dom.dropTitle.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  dom.uploadSubmitBtn.disabled = false;
}

async function uploadPdfDocument(e) {
  e.preventDefault();
  if (!state.selectedFile || state.isUploadingPdf) return;

  state.isUploadingPdf = true;
  dom.uploadSubmitBtn.disabled = true;
  dom.uploadProgressBox.classList.remove('hidden');
  dom.uploadFilename.textContent = state.selectedFile.name;
  dom.uploadStatusPct.textContent = `Indexando en ${state.modality}...`;

  const formData = new FormData();
  formData.append('file', state.selectedFile);
  formData.append('modality', state.modality);
  formData.append('tenant_id', dom.tenantInput.value.trim() || 'default');

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/documents/upload-pdf`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.error || 'Error al procesar el PDF');
    }

    state.indexedDocs.unshift({
      filename: data.filename,
      modality: data.modality,
      pages: data.pages_processed ?? data.pagesProcessed ?? 1,
      chunks: data.chunks_saved ?? data.chunksSaved ?? 0
    });

    renderIndexedDocs();
    showToast(
      'PDF Indexado con éxito',
      `${data.filename}: ${data.pages_processed ?? data.pagesProcessed} págs · ${data.chunks_saved ?? data.chunksSaved} fragmentos guardados.`,
      'success'
    );

    state.selectedFile = null;
    dom.pdfFileInput.value = '';
    dom.dropTitle.textContent = 'Arrastra tu PDF táctico o haz clic para explorar';
  } catch (err) {
    showToast('Error al indexar PDF', err.message, 'error');
    dom.uploadSubmitBtn.disabled = false;
  } finally {
    state.isUploadingPdf = false;
    dom.uploadProgressBox.classList.add('hidden');
  }
}

function renderIndexedDocs() {
  dom.indexedCountBadge.textContent = String(state.indexedDocs.length);
  if (state.indexedDocs.length === 0) {
    dom.indexedDocsList.innerHTML = '<li class="empty-docs-msg">Aún no has subido PDFs en esta sesión.</li>';
    return;
  }

  dom.indexedDocsList.innerHTML = state.indexedDocs
    .map(
      (doc) => `
      <li class="indexed-doc-item">
        <div class="doc-item-main">
          <span class="doc-item-name">📘 ${escapeHtml(doc.filename)}</span>
          <span class="doc-item-meta">${escapeHtml(doc.modality)} · ${doc.pages} pág(s)</span>
        </div>
        <span class="doc-item-badge">${doc.chunks} chunks</span>
      </li>
    `
    )
    .join('');
}

/* ==========================================================================
   7. Tactical Chat Assistant (POST /api/v1/tactical/ask)
   ========================================================================== */
function appendWelcomeMessage() {
  dom.chatMessages.innerHTML = '';
  const activeSetup = getActiveFormationSetup();
  appendAssistantMessage({
    reply:
      '¡Hola míster! Soy tu entrenador asistente en **TacticalPlay RAG**.\n\n' +
      '* Puedes preguntarme cualquier duda táctica, analizar tu formación o pedir ajustes personalizados sobre los jugadores de **Tu Propia Plantilla**.\n' +
      '* En la pestaña **🏟️ Pizarra & Formaciones** tienes 30 alineaciones, el **DT Referente** para cada sistema y **Jugadas Preparadas de Balón Parado** animadas sobre la cancha.',
    modality: state.modality,
    suggestedFormation: activeSetup.code,
    sources: ['Base Vectorial pgvector + Wikipedia API']
  });
}

function appendUserMessage(text, modality, formation, playStyle) {
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `
    <div class="message-meta">
      <span>Entrenador</span>
      <span>·</span>
      <span>${escapeHtml(modality)} (${escapeHtml(formation)} · ${escapeHtml(playStyle)})</span>
    </div>
    <div class="message-bubble">${escapeHtml(text)}</div>
  `;
  dom.chatMessages.appendChild(row);
  scrollToBottom();
}

function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.id = 'typing-row';
  row.innerHTML = `
    <div class="message-meta">
      <span>Entrenador IA</span>
      <span>·</span>
      <span>Preparando indicaciones de cancha...</span>
    </div>
    <div class="typing-indicator">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  dom.chatMessages.appendChild(row);
  scrollToBottom();
}

function removeTypingIndicator() {
  const existing = document.getElementById('typing-row');
  if (existing) existing.remove();
}

function formatMarkdownToHtml(rawText) {
  if (!rawText) return '';

  const lines = String(rawText).replace(/\r\n/g, '\n').split('\n');
  const htmlParts = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      htmlParts.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      htmlParts.push('</ol>');
      inOl = false;
    }
  };

  const formatInline = (text) => {
    let safe = escapeHtml(text);
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/__(.+?)__/g, '<strong>$1</strong>');
    safe = safe.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    safe = safe.replace(/\*\*/g, '');
    return safe;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeLists();
      continue;
    }

    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      htmlParts.push(`<h4 class="chat-heading">${formatInline(headingMatch[1])}</h4>`);
      continue;
    }

    const olMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (olMatch) {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        htmlParts.push('<ol class="chat-list">');
        inOl = true;
      }
      htmlParts.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    const ulMatch = line.match(/^[*•\-]\s+(.*)$/);
    if (ulMatch) {
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        htmlParts.push('<ul class="chat-list">');
        inUl = true;
      }
      htmlParts.push(`<li>${formatInline(ulMatch[1])}</li>`);
      continue;
    }

    closeLists();
    htmlParts.push(`<p class="chat-paragraph">${formatInline(line)}</p>`);
  }

  closeLists();
  return htmlParts.join('');
}

function appendAssistantMessage(data) {
  const rawReply = data.reply || '';
  const formation = data.suggestedFormation || data.suggested_formation || getActiveFormationSetup().code;
  const sources = Array.isArray(data.sources) ? data.sources : [];

  const marker = 'Contexto documental recuperado de tus PDFs:';
  let mainAnalysis = rawReply;
  let ragContextBlockHtml = '';

  if (rawReply.includes(marker)) {
    const parts = rawReply.split(marker);
    mainAnalysis = parts[0].trim();
    const snippetsRaw = parts[1].trim();
    const snippetLines = snippetsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    ragContextBlockHtml = `
      <div class="rag-context-block">
        <div class="rag-context-title">📑 Contexto Documental Recuperado (PostgreSQL + pgvector)</div>
        ${snippetLines.map((line) => `<div class="rag-snippet-item">${escapeHtml(line)}</div>`).join('')}
      </div>
    `;
  }

  const formattedAnalysisHtml = formatMarkdownToHtml(mainAnalysis);
  const sourcesHtml = sources
    .map((src) => `<span class="source-chip">📄 ${escapeHtml(src)}</span>`)
    .join('');

  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.innerHTML = `
    <div class="message-meta">
      <span>Entrenador IA</span>
      <span>·</span>
      <span>${escapeHtml(data.modality || state.modality)}</span>
    </div>
    <div class="message-bubble">
      <div class="chat-formatted-content">${formattedAnalysisHtml}</div>
      ${ragContextBlockHtml}
      <div class="message-footer-tags">
        <span class="formation-tag">📐 Formación: ${escapeHtml(formation)}</span>
        ${sourcesHtml}
      </div>
    </div>
  `;

  dom.chatMessages.appendChild(row);
  scrollToBottom();
}

async function sendChatMessage(messageText) {
  const cleanMessage = messageText.trim();
  if (!cleanMessage || state.isSendingChat) return;

  const activeSetup = getActiveFormationSetup();
  state.isSendingChat = true;
  dom.sendChatBtn.disabled = true;
  dom.chatInput.value = '';

  appendUserMessage(cleanMessage, state.modality, activeSetup.code, state.playStyle);
  showTypingIndicator();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/tactical/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: cleanMessage,
        modality: state.modality,
        formation: activeSetup.code,
        playStyle: state.playStyle
      })
    });

    const data = await response.json();
    removeTypingIndicator();

    if (!response.ok) {
      const errorMsg = data.detail || data.error || 'Error en la consulta táctica';
      throw new Error(errorMsg);
    }

    appendAssistantMessage(data);
  } catch (err) {
    removeTypingIndicator();
    const msg =
      err.name === 'AbortError'
        ? 'La consulta superó el tiempo límite de 20 segundos. Verifica que el backend esté activo.'
        : err.message;
    showToast('Error en el Asistente Táctico', msg, 'error');
  } finally {
    clearTimeout(timeoutId);
    state.isSendingChat = false;
    dom.sendChatBtn.disabled = false;
    dom.chatInput.focus();
  }
}

function scrollToBottom() {
  dom.chatMessages.scrollTo({
    top: dom.chatMessages.scrollHeight,
    behavior: 'smooth'
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   8. Tab 3: Tu Propia Plantilla (Squad Management & Top 100 Comparison)
   ========================================================================== */
const NATURAL_POSITIONS_FUTSAL = [
  { code: 'POR', label: 'POR · Portero' },
  { code: 'CIE', label: 'CIE · Cierre' },
  { code: 'ALA', label: 'ALA · Ala' },
  { code: 'PIV', label: 'PIV · Pívot' }
];

const NATURAL_POSITIONS_FIELD = [
  { code: 'POR', label: 'POR · Portero' },
  { code: 'DFC', label: 'DFC · Defensa Central' },
  { code: 'LD', label: 'LD · Lateral / Carrilero Der.' },
  { code: 'LI', label: 'LI · Lateral / Carrilero Izq.' },
  { code: 'MCD', label: 'MCD · Pivote Defensivo' },
  { code: 'MC', label: 'MC · Volante Mixto / Interior' },
  { code: 'MCO', label: 'MCO · Enganche / Mediapunta' },
  { code: 'ED', label: 'ED · Extremo Derecho' },
  { code: 'EI', label: 'EI · Extremo Izquierdo' },
  { code: 'DC', label: 'DC · Delantero Centro' }
];

let activeDragPayload = null;

function isPlayerCompatibleWithActiveModality(positionCode, modality = state.squadModality) {
  const pos = String(positionCode || '').toUpperCase().trim();
  const isFutsal = String(modality || '').toLowerCase().includes('futsal');
  if (isFutsal) {
    return ['POR', 'CIE', 'ALA', 'PIV'].includes(pos);
  }
  return ['POR', 'DFC', 'LD', 'LI', 'MCD', 'MC', 'MCO', 'ED', 'EI', 'DC'].includes(pos);
}

function isStrictNaturalPositionMatch(playerPos, slotRole) {
  const pos = String(playerPos || '').toUpperCase().trim();
  const slot = String(slotRole || '').toUpperCase().trim();
  if (pos === slot) return true;
  if (pos === 'POR') return slot === 'POR' || slot === 'PJ' || slot.includes('PORTERO');
  if (slot === 'POR' || slot === 'PJ' || slot.includes('PORTERO')) return false;

  switch (pos) {
    case 'CIE':
      return slot.startsWith('CIE') || slot.startsWith('UNI') || slot.startsWith('INT') || slot === 'FIXO';
    case 'ALA':
      return slot.startsWith('ALA') || slot.startsWith('INT') || slot.startsWith('ENG') || slot.startsWith('UNI') || slot.startsWith('CIE-') || slot.startsWith('PIV-');
    case 'PIV':
      return slot.startsWith('PIV') || slot.startsWith('UNI') || slot === 'ENG' || slot.includes('PÍVOT');
    case 'DFC':
      return slot.startsWith('DFC') || slot.startsWith('DF-') || slot === 'LIB';
    case 'LD':
      return slot === 'LD' || slot === 'LAT-D' || slot === 'CAR-D' || slot === 'DF-D' || slot === 'MD' || slot === 'CAD';
    case 'LI':
      return slot === 'LI' || slot === 'LAT-I' || slot === 'CAR-I' || slot === 'DF-I' || slot === 'MI' || slot === 'CAI';
    case 'MCD':
      return slot.startsWith('MCD') || slot === 'PIV' || slot.startsWith('MC') || slot.startsWith('INT');
    case 'MC':
      return slot.startsWith('MC') || slot.startsWith('INT') || slot === 'PIV';
    case 'MCO':
      return slot.startsWith('MCO') || slot === 'ENG' || slot.startsWith('INT') || slot.startsWith('MC') || slot === 'SD' || slot === 'F9';
    case 'ED':
      return slot === 'ED' || slot === 'EXT-D' || slot === 'MD' || slot === 'CAR-D' || slot === 'DC-D' || slot === 'SD';
    case 'EI':
      return slot === 'EI' || slot === 'EXT-I' || slot === 'MI' || slot === 'CAR-I' || slot === 'DC-I' || slot === 'SD';
    case 'DC':
      return slot.startsWith('DC') || slot === 'SD' || slot === 'F9' || slot === '9';
    default:
      return false;
  }
}

function populatePlayerPositionSelect() {
  if (!dom.playerPosSelect) return;
  const isFutsal = String(state.squadModality || '').toLowerCase().includes('futsal');
  const options = isFutsal ? NATURAL_POSITIONS_FUTSAL : NATURAL_POSITIONS_FIELD;
  const currentVal = dom.playerPosSelect.value;

  dom.playerPosSelect.innerHTML = options
    .map((opt) => `<option value="${opt.code}">${escapeHtml(opt.label)}</option>`)
    .join('');

  if (options.some((o) => o.code === currentVal)) {
    dom.playerPosSelect.value = currentVal;
  } else {
    dom.playerPosSelect.value = isFutsal ? 'ALA' : 'MC';
  }
}

function populateSquadFormationDropdown() {
  if (!dom.squadFormationSelect) return;
  const list = FORMATIONS_BY_MODALITY[state.squadModality] || FORMATIONS_BY_MODALITY['Fútbol 11'];
  dom.squadFormationSelect.innerHTML = list
    .map((item, idx) => `<option value="${idx}" ${idx === state.squadFormationIndex ? 'selected' : ''}>${escapeHtml(item.code)}</option>`)
    .join('');
}

function getActiveSquadFormationSetup() {
  const list = FORMATIONS_BY_MODALITY[state.squadModality] || FORMATIONS_BY_MODALITY['Fútbol 11'];
  return list[state.squadFormationIndex % list.length];
}

function computePlayerOverall(p) {
  if (!p) return 75;
  if (typeof p.overall === 'number') return p.overall;
  return Math.round((p.pace + p.passing + p.dribbling + p.defending + p.shooting + p.vision) / 6);
}

async function refreshSquadAndOptimize(idealChemistryMode = false) {
  if (!dom.squadRosterList) return;
  const setup = getActiveSquadFormationSetup();
  const targetSlots = setup.players.map((p) => p.role);
  const selectedPlayStyle = dom.squadStyleSelect ? dom.squadStyleSelect.value : 'Posesión';

  try {
    const [playersRes, optRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v1/squad/players`),
      fetch(`${API_BASE_URL}/api/v1/squad/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modality: state.squadModality,
          formation: setup.code,
          targetSlots,
          playStyle: selectedPlayStyle,
          idealChemistryMode: Boolean(idealChemistryMode)
        })
      })
    ]);

    if (playersRes.ok) {
      state.squadPlayers = await playersRes.json();
    }
    if (optRes.ok) {
      state.squadOptimization = await optRes.json();
    }

    const modalityPlayers = state.squadPlayers.filter((p) =>
      isPlayerCompatibleWithActiveModality(p.position, state.squadModality)
    );
    if (
      modalityPlayers.length > 0 &&
      !modalityPlayers.some((p) => p.id === state.selectedSquadPlayerId)
    ) {
      state.selectedSquadPlayerId = modalityPlayers[0].id;
    }

    renderSquadRosterList();
    renderSquadPitch();
    renderSquadBench();
    renderIdealSquadBanner(idealChemistryMode);
    renderSelectedPlayerComparison();
  } catch (err) {
    console.warn('No se pudo cargar la plantilla personalizada:', err);
  }
}

function renderIdealSquadBanner(showBanner = false) {
  if (!dom.idealSquadBanner) return;
  const opt = state.squadOptimization;
  if (!showBanner || !opt || !opt.idealMode) {
    dom.idealSquadBanner.classList.add('hidden');
    return;
  }

  const setup = getActiveSquadFormationSetup();
  const activeStyle = opt.playStyle || (dom.squadStyleSelect ? dom.squadStyleSelect.value : 'Posesión');
  if (dom.idealBannerTitle) {
    dom.idealBannerTitle.textContent = `✨ Plantilla Ideal por Química Colectiva · ${setup.code} (${activeStyle})`;
  }
  if (dom.idealBannerText) {
    dom.idealBannerText.textContent =
      opt.idealExplanation ||
      `Combinación óptima calculada para ${state.squadModality} maximizando complementariedad de roles, pie hábil y sinergia para el estilo ${activeStyle}.`;
  }
  if (dom.idealBannerPartners) {
    const partnerships = Array.isArray(opt.keyPartnerships) ? opt.keyPartnerships : [];
    dom.idealBannerPartners.innerHTML = partnerships
      .map((p) => `<span class="ideal-partner-pill">⚡ ${escapeHtml(p)}</span>`)
      .join('');
  }
  dom.idealSquadBanner.classList.remove('hidden');
}

async function handleGenerateIdealSquad() {
  if (!dom.generateIdealSquadBtn) return;
  dom.generateIdealSquadBtn.disabled = true;
  const activeStyle = dom.squadStyleSelect ? dom.squadStyleSelect.value : 'Posesión & Juego de Posición';

  try {
    await refreshSquadAndOptimize(true);
    const synergyPct = state.squadOptimization?.globalSynergy || 95;
    showToast(
      `✨ Plantilla Ideal Generada (${synergyPct}% Sinergia)`,
      `Titulares y banca optimizados por química colectiva, pie hábil y complementariedad para '${activeStyle}'.`,
      'success'
    );
  } finally {
    dom.generateIdealSquadBtn.disabled = false;
  }
}

function handleExportSquadToBoard() {
  const setup = getActiveSquadFormationSetup();
  const lineup = state.squadOptimization?.lineup || [];
  const selectedStyle = dom.squadStyleSelect
    ? dom.squadStyleSelect.value
    : 'Posesión & Juego de Posición';

  // Sincronizar modalidad, formación, estilo y titulares reales con la Pizarra Táctica (Tab 2)
  clearPlaybackTimers();
  state.modality = state.squadModality;
  state.formationIndex = state.squadFormationIndex;
  state.playStyle = PLAY_STYLE_MODIFIERS[selectedStyle]
    ? selectedStyle
    : 'Posesión & Juego de Posición';
  state.setPieceIndex = 0;
  state.setPieceStep = 0;

  state.exportedBoardLineup = {
    modality: state.squadModality,
    formationIndex: state.squadFormationIndex,
    formationCode: setup.code,
    playStyle: state.playStyle,
    starters: lineup.map((s) => ({ ...s }))
  };

  // Actualizar controles visuales en Tab 1 y Tab 2
  dom.modalitySelector.querySelectorAll('.modality-btn').forEach((btn) => {
    const isMatch = btn.dataset.modality === state.modality;
    btn.classList.toggle('active', isMatch);
    if (isMatch && dom.playersCountTag) {
      dom.playersCountTag.textContent = btn.dataset.players;
    }
  });
  dom.boardModalityPills.querySelectorAll('.board-mod-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.modality === state.modality);
  });

  populateFormationDropdown();
  if (dom.formationSelect) {
    dom.formationSelect.value = String(state.formationIndex);
  }
  if (dom.styleSelect) {
    dom.styleSelect.value = state.playStyle;
  }
  populateSetPieceDropdown();

  switchTab('board');
  renderTacticalPitch(true);

  const startersCount = lineup.filter((s) => s.assigned && s.playerId).length;
  showToast(
    '📤 Plantilla Exportada a la Pizarra',
    `${startersCount} titulares (${state.modality} · ${setup.code} · ${state.playStyle}) listos en cancha para ejecutar Jugadas Preparadas.`,
    'success'
  );
}

function handleExportPrintableMatchPlan(sourceTab = 'board') {
  if (!dom.printableMatchPlan) return;

  const isFromSquad = sourceTab === 'squad';
  const activeModality = isFromSquad ? state.squadModality : state.modality;
  const activeSetup = isFromSquad ? getActiveSquadFormationSetup() : getActiveFormationSetup();
  const activeStyle = isFromSquad
    ? (dom.squadStyleSelect ? dom.squadStyleSelect.value : state.playStyle)
    : state.playStyle;

  const styleMod = PLAY_STYLE_MODIFIERS[activeStyle] || PLAY_STYLE_MODIFIERS['Posesión & Juego de Posición'];
  const coachInfo = resolveReferenceCoach(activeModality, activeSetup.code, activeStyle);

  // Resolver titulares y banca (desde Tu Propia Plantilla o desde Pizarra Exportada/Genérica)
  const squadOpt = state.squadOptimization;
  const hasRealSquadForModality =
    isFromSquad ||
    (state.exportedBoardLineup && state.exportedBoardLineup.modality === activeModality) ||
    (squadOpt && squadOpt.modality === activeModality && Array.isArray(squadOpt.lineup) && squadOpt.lineup.some((s) => s.assigned));

  const rawLineup = isFromSquad
    ? (squadOpt?.lineup || [])
    : (state.exportedBoardLineup?.modality === activeModality
        ? state.exportedBoardLineup.starters
        : (squadOpt?.modality === activeModality ? squadOpt.lineup : []));

  const substitutes = squadOpt?.modality === activeModality ? (squadOpt?.substitutes || []) : [];
  const synergyText = hasRealSquadForModality && squadOpt?.globalSynergy
    ? `${squadOpt.globalSynergy}%`
    : '92% (Base Táctica)';

  const startersRowsHtml = activeSetup.players
    .map((slotPlayer, idx) => {
      const assigned = rawLineup?.[idx];
      const hasPlayer = Boolean(assigned && assigned.assigned && assigned.playerId);
      const dorsal = hasPlayer ? assigned.jerseyNumber : slotPlayer.num;
      const playerName = hasPlayer ? assigned.name : `Titular Posicional (${slotPlayer.role})`;
      const naturalPos = hasPlayer ? assigned.naturalPosition : slotPlayer.role;
      const foot = hasPlayer ? (assigned.preferredFoot || 'Derecho') : 'Perfil Natural';
      return `
        <tr>
          <td><strong>#${escapeHtml(String(dorsal))}</strong></td>
          <td><strong>${escapeHtml(playerName)}</strong></td>
          <td>${escapeHtml(slotPlayer.role)}</td>
          <td>${escapeHtml(naturalPos)}</td>
          <td>${escapeHtml(foot)}</td>
        </tr>
      `;
    })
    .join('');

  const benchRowsHtml = substitutes.length > 0
    ? substitutes
        .map(
          (sub) => `
            <tr>
              <td>#${escapeHtml(String(sub.jerseyNumber))}</td>
              <td>${escapeHtml(sub.name)}</td>
              <td>${escapeHtml(sub.naturalPosition || sub.position || 'SUP')}</td>
              <td>${escapeHtml(sub.preferredFoot || 'Derecho')}</td>
              <td>Media ${escapeHtml(String(sub.overall || 82))} (Revulsivo)</td>
            </tr>
          `
        )
        .join('')
    : `<tr><td colspan="5">Sin suplentes adicionales registrados en banca para ${escapeHtml(activeModality)}.</td></tr>`;

  // Jugada preparada activa o primera jugada ofensiva recomendada de la modalidad
  let activeSetPiece = getActiveSetPiece();
  let setPiecePhaseLabel = state.setPieceCategory === 'defense' ? 'Defensa / Balón Parado' : 'Ataque / Balón Parado';
  if (!activeSetPiece) {
    const attackCatalog = activeModality === 'Futsal' ? FUTSAL_ATTACK_PLAYS : FIELD_ATTACK_PLAYS;
    activeSetPiece = attackCatalog[0] || null;
    setPiecePhaseLabel = 'Jugada Preparada Recomendada (Ataque)';
  }

  const setPieceStepsHtml = activeSetPiece
    ? `<ol>${activeSetPiece.steps
        .map((st) => `<li>${escapeHtml(formatSetPieceStepText(st, activeSetup, rawLineup, activeModality))}</li>`)
        .join('')}</ol>`
    : '<p>Juego posicional libre según funciones de línea.</p>';

  const nowStr = new Date().toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  dom.printableMatchPlan.innerHTML = `
    <div class="print-sheet-header">
      <div>
        <h1 class="print-brand-title">TacticalPlay RAG — Plan Táctico de Partido</h1>
        <div class="print-brand-subtitle">Ficha Oficial de Vestuario · Generada por Asistente Táctico IA &amp; Simulador Posicional</div>
      </div>
      <div class="print-meta-box">
        <div><strong>Fecha:</strong> ${escapeHtml(nowStr)}</div>
        <div><strong>Sinergia Global:</strong> ${escapeHtml(synergyText)}</div>
      </div>
    </div>

    <div class="print-summary-grid">
      <div class="print-summary-item">
        <span class="print-summary-label">Modalidad &amp; Sistema</span>
        <span class="print-summary-value">${escapeHtml(activeModality)} · ${escapeHtml(activeSetup.code)}</span>
      </div>
      <div class="print-summary-item">
        <span class="print-summary-label">Estilo de Juego</span>
        <span class="print-summary-value">${escapeHtml(activeStyle)}</span>
      </div>
      <div class="print-summary-item">
        <span class="print-summary-label">DT Referente (${escapeHtml(coachInfo.badge)})</span>
        <span class="print-summary-value">${escapeHtml(coachInfo.name)}</span>
      </div>
    </div>

    <h3 class="print-section-title">1. Alineación Titular en Cancha (${activeSetup.players.length} Jugadores)</h3>
    <table class="print-table">
      <thead>
        <tr>
          <th style="width: 10%">Dorsal</th>
          <th style="width: 36%">Jugador Titular</th>
          <th style="width: 18%">Rol en Sistema</th>
          <th style="width: 18%">Pos. Natural</th>
          <th style="width: 18%">Pie Hábil</th>
        </tr>
      </thead>
      <tbody>
        ${startersRowsHtml}
      </tbody>
    </table>

    <h3 class="print-section-title">2. Banca de Suplentes &amp; Revulsivos</h3>
    <table class="print-table">
      <thead>
        <tr>
          <th style="width: 10%">Dorsal</th>
          <th style="width: 36%">Jugador Suplente</th>
          <th style="width: 18%">Pos. Natural</th>
          <th style="width: 18%">Pie Hábil</th>
          <th style="width: 18%">Rol de Recambio</th>
        </tr>
      </thead>
      <tbody>
        ${benchRowsHtml}
      </tbody>
    </table>

    <h3 class="print-section-title">3. Instrucciones por Línea &amp; Jugada Preparada</h3>
    <div class="print-two-cols">
      <div class="print-card-box">
        <h4>Funciones Tácticas por Línea</h4>
        <p><strong>• Salida &amp; Defensa:</strong> ${escapeHtml(activeSetup.defenseRole)} ${escapeHtml(styleMod.defenseAddon)}</p>
        <p><strong>• Mediocampo &amp; Elaboración:</strong> ${escapeHtml(activeSetup.midfieldRole)} ${escapeHtml(styleMod.midfieldAddon)}</p>
        <p><strong>• Definición &amp; Presión:</strong> ${escapeHtml(activeSetup.attackRole)} ${escapeHtml(styleMod.attackAddon)}</p>
        <p><strong>• Efecto del Estilo:</strong> ${escapeHtml(styleMod.effect)}</p>
      </div>
      <div class="print-card-box">
        <h4>${escapeHtml(setPiecePhaseLabel)}: ${escapeHtml(activeSetPiece ? activeSetPiece.name : 'Posicional')}</h4>
        ${setPieceStepsHtml}
        <p style="margin-top: 6px;"><strong>• Modelo DT (${escapeHtml(coachInfo.name)}):</strong> ${escapeHtml(coachInfo.note)}</p>
      </div>
    </div>

    <div class="print-footer-note">
      <span>TacticalPlay RAG · Motor Táctico Multideporte (Futsal · Fútbol 7 · Fútbol 9 · Fútbol 11)</span>
      <span>Documento listo para vestuario / charla técnica</span>
    </div>
  `;

  window.print();
}

function renderSquadRosterList() {
  if (!dom.squadRosterList) return;
  const compatiblePlayers = state.squadPlayers.filter((p) =>
    isPlayerCompatibleWithActiveModality(p.position, state.squadModality)
  );
  dom.squadCountBadge.textContent = String(compatiblePlayers.length);

  if (compatiblePlayers.length === 0) {
    dom.squadRosterList.innerHTML =
      `<li class="empty-docs-msg">No hay jugadores registrados para <strong>${escapeHtml(state.squadModality)}</strong>. Registra uno arriba o pulsa "⚡ Cargar Plantilla Demo".</li>`;
    return;
  }

  dom.squadRosterList.innerHTML = compatiblePlayers
    .map((p) => {
      const isSelected = p.id === state.selectedSquadPlayerId;
      const avg = computePlayerOverall(p);
      return `
        <li class="roster-player-item ${isSelected ? 'selected' : ''}" data-player-id="${p.id}">
          <div class="roster-item-left">
            <span class="roster-num-badge">${p.jerseyNumber}</span>
            <div class="doc-item-main">
              <span class="doc-item-name">${escapeHtml(p.name)}</span>
              <span class="doc-item-meta">${escapeHtml(p.position)} · Pie ${escapeHtml(p.preferredFoot)} · Media ${avg}</span>
            </div>
          </div>
          <button type="button" class="roster-delete-btn" data-delete-id="${p.id}" title="Eliminar jugador">✕</button>
        </li>
      `;
    })
    .join('');
}

function renderSquadBench() {
  if (!dom.squadBenchList) return;
  const substitutes = state.squadOptimization?.substitutes || [];
  if (dom.benchCountBadge) {
    dom.benchCountBadge.textContent = `${substitutes.length} en banca`;
  }

  if (substitutes.length === 0) {
    dom.squadBenchList.innerHTML =
      '<div class="bench-empty-msg">No hay suplentes en banca. Si registras más de un jugador en la misma posición natural (o arrastras un titular aquí), aparecerán en la banca listos para entrar al campo.</div>';
    return;
  }

  dom.squadBenchList.innerHTML = substitutes
    .map((sub) => {
      const isSelected = sub.playerId === state.selectedSquadPlayerId;
      return `
        <div
          class="bench-player-chip ${isSelected ? 'selected-bench' : ''}"
          draggable="true"
          data-player-id="${sub.playerId}"
          title="Arrastra a cualquier posición de la cancha"
        >
          <span class="bench-chip-num">${sub.jerseyNumber}</span>
          <div class="bench-chip-info">
            <span class="bench-chip-name">${escapeHtml(sub.name)}</span>
            <span class="bench-chip-meta">Pie ${escapeHtml(sub.preferredFoot || 'Derecho')} · Media ${sub.overall || 80}</span>
          </div>
          <span class="bench-chip-pos">${escapeHtml(sub.naturalPosition)}</span>
        </div>
      `;
    })
    .join('');
}

function recalculateLineupSynergy() {
  const opt = state.squadOptimization;
  if (!opt || !Array.isArray(opt.lineup)) return;

  let totalFit = 0;
  opt.lineup.forEach((slot) => {
    if (!slot.assigned || !slot.playerId) {
      slot.fitScore = 60;
      totalFit += 60;
      return;
    }
    const naturalMatch = isStrictNaturalPositionMatch(slot.naturalPosition, slot.slotRole);
    slot.outOfPosition = !naturalMatch;
    const baseOverall = slot.overall || 82;
    if (naturalMatch) {
      slot.fitScore = Math.min(99, Math.round(84 + (baseOverall - 70) * 0.45));
    } else {
      // Penalización por colocar fuera de su puesto natural
      slot.fitScore = Math.max(52, Math.round(64 + (baseOverall - 75) * 0.25));
    }
    totalFit += slot.fitScore;
  });

  const avgSynergy = opt.lineup.length > 0 ? Math.round(totalFit / opt.lineup.length) : 82;
  opt.globalSynergy = Math.max(55, Math.min(99, avgSynergy));
  if (dom.squadGlobalSynergy) {
    dom.squadGlobalSynergy.textContent = `${opt.globalSynergy}%`;
  }
}

function handlePitchSlotDrop(targetSlotIdx) {
  if (!activeDragPayload || !state.squadOptimization) return;
  const opt = state.squadOptimization;
  const lineup = opt.lineup || [];
  const substitutes = opt.substitutes || [];
  const targetSlot = lineup[targetSlotIdx];
  if (!targetSlot) return;

  if (activeDragPayload.source === 'bench') {
    const subIdx = substitutes.findIndex((s) => s.playerId === activeDragPayload.playerId);
    if (subIdx === -1) return;
    const incomingSub = substitutes.splice(subIdx, 1)[0];

    // Si el puesto estaba ocupado por un titular, ese titular pasa a la banca
    if (targetSlot.assigned && targetSlot.playerId) {
      substitutes.push({
        playerId: targetSlot.playerId,
        name: targetSlot.name,
        jerseyNumber: targetSlot.jerseyNumber,
        naturalPosition: targetSlot.naturalPosition,
        preferredFoot: targetSlot.preferredFoot || 'Derecho',
        overall: targetSlot.overall || 82
      });
    }

    targetSlot.assigned = true;
    targetSlot.playerId = incomingSub.playerId;
    targetSlot.name = incomingSub.name;
    targetSlot.jerseyNumber = incomingSub.jerseyNumber;
    targetSlot.naturalPosition = incomingSub.naturalPosition;
    targetSlot.preferredFoot = incomingSub.preferredFoot;
    targetSlot.overall = incomingSub.overall;
    targetSlot.outOfPosition = !isStrictNaturalPositionMatch(incomingSub.naturalPosition, targetSlot.slotRole);
    state.selectedSquadPlayerId = incomingSub.playerId;
  } else if (activeDragPayload.source === 'pitch') {
    const sourceSlotIdx = activeDragPayload.slotIndex;
    if (sourceSlotIdx === targetSlotIdx) return;
    const sourceSlot = lineup[sourceSlotIdx];
    if (!sourceSlot || !sourceSlot.assigned) return;

    // Intercambio (swap) entre dos puestos de la cancha (incluso si el destino estaba vacante)
    const temp = {
      assigned: targetSlot.assigned,
      playerId: targetSlot.playerId,
      name: targetSlot.name,
      jerseyNumber: targetSlot.jerseyNumber,
      naturalPosition: targetSlot.naturalPosition,
      preferredFoot: targetSlot.preferredFoot,
      overall: targetSlot.overall
    };

    targetSlot.assigned = true;
    targetSlot.playerId = sourceSlot.playerId;
    targetSlot.name = sourceSlot.name;
    targetSlot.jerseyNumber = sourceSlot.jerseyNumber;
    targetSlot.naturalPosition = sourceSlot.naturalPosition;
    targetSlot.preferredFoot = sourceSlot.preferredFoot;
    targetSlot.overall = sourceSlot.overall;
    targetSlot.outOfPosition = !isStrictNaturalPositionMatch(targetSlot.naturalPosition, targetSlot.slotRole);

    if (temp.assigned && temp.playerId) {
      sourceSlot.assigned = true;
      sourceSlot.playerId = temp.playerId;
      sourceSlot.name = temp.name;
      sourceSlot.jerseyNumber = temp.jerseyNumber;
      sourceSlot.naturalPosition = temp.naturalPosition;
      sourceSlot.preferredFoot = temp.preferredFoot;
      sourceSlot.overall = temp.overall;
      sourceSlot.outOfPosition = !isStrictNaturalPositionMatch(sourceSlot.naturalPosition, sourceSlot.slotRole);
    } else {
      sourceSlot.assigned = false;
      sourceSlot.playerId = null;
      sourceSlot.name = `Vacante (${sourceSlot.slotRole})`;
      sourceSlot.jerseyNumber = 0;
      sourceSlot.naturalPosition = sourceSlot.slotRole;
      sourceSlot.outOfPosition = false;
    }

    state.selectedSquadPlayerId = targetSlot.playerId;
  }

  activeDragPayload = null;
  recalculateLineupSynergy();
  renderSquadRosterList();
  renderSquadPitch();
  renderSquadBench();
  renderSelectedPlayerComparison();
}

function handleSendStarterToBench() {
  if (!activeDragPayload || activeDragPayload.source !== 'pitch' || !state.squadOptimization) return;
  const opt = state.squadOptimization;
  const lineup = opt.lineup || [];
  const substitutes = opt.substitutes || [];
  const sourceSlot = lineup[activeDragPayload.slotIndex];
  if (!sourceSlot || !sourceSlot.assigned || !sourceSlot.playerId) return;

  substitutes.push({
    playerId: sourceSlot.playerId,
    name: sourceSlot.name,
    jerseyNumber: sourceSlot.jerseyNumber,
    naturalPosition: sourceSlot.naturalPosition,
    preferredFoot: sourceSlot.preferredFoot || 'Derecho',
    overall: sourceSlot.overall || 82
  });

  sourceSlot.assigned = false;
  sourceSlot.playerId = null;
  sourceSlot.name = `Vacante (${sourceSlot.slotRole})`;
  sourceSlot.jerseyNumber = 0;
  sourceSlot.naturalPosition = sourceSlot.slotRole;
  sourceSlot.outOfPosition = false;

  activeDragPayload = null;
  recalculateLineupSynergy();
  renderSquadRosterList();
  renderSquadPitch();
  renderSquadBench();
  renderSelectedPlayerComparison();
}

function renderSquadPitch() {
  if (!dom.squadPitchTokens || !dom.squadSynergyLinks) return;
  const setup = getActiveSquadFormationSetup();
  const opt = state.squadOptimization;
  const lineup = opt?.lineup || [];

  if (dom.squadGlobalSynergy && opt?.globalSynergy) {
    dom.squadGlobalSynergy.textContent = `${opt.globalSynergy}%`;
  }

  const pitchWidth = dom.squadPitchTokens.clientWidth || 580;
  const pitchHeight = dom.squadPitchTokens.clientHeight || 430;
  const scaleX = pitchWidth / 360;
  const scaleY = pitchHeight / 220;

  const existingTokens = Array.from(dom.squadPitchTokens.querySelectorAll('.player-token'));
  while (existingTokens.length > setup.players.length) {
    existingTokens.pop().remove();
  }

  const movingEls = [];

  setup.players.forEach((slotPlayer, idx) => {
    const assignedSlot = lineup[idx];
    let tokenEl = existingTokens[idx];
    if (!tokenEl) {
      tokenEl = document.createElement('div');
      tokenEl.className = 'player-token squad-token';
      tokenEl.style.transform = `translate(${180 * scaleX}px, ${110 * scaleY}px) scale(0.5)`;
      dom.squadPitchTokens.appendChild(tokenEl);
    }

    const isAssigned = Boolean(assignedSlot?.assigned && assignedSlot?.playerId);
    const playerId = isAssigned ? assignedSlot.playerId : null;
    const isOutOfPos =
      isAssigned &&
      (assignedSlot.outOfPosition ||
        !isStrictNaturalPositionMatch(assignedSlot.naturalPosition, slotPlayer.role));

    const displayNum = isAssigned ? assignedSlot.jerseyNumber : '+';
    const shortName = isAssigned
      ? `${assignedSlot.name.split(' ')[0]} (${assignedSlot.naturalPosition}${isOutOfPos ? ' ⚠' : ''})`
      : `Vacante · ${slotPlayer.role}`;
    const isSelected = playerId && playerId === state.selectedSquadPlayerId;

    tokenEl.className = [
      'player-token',
      'squad-token',
      slotPlayer.gk ? 'gk' : '',
      isSelected ? 'selected-token' : '',
      !isAssigned ? 'vacant-slot' : '',
      isOutOfPos ? 'out-of-position' : ''
    ]
      .filter(Boolean)
      .join(' ');

    tokenEl.textContent = String(displayNum);
    tokenEl.setAttribute('data-role', shortName);
    tokenEl.dataset.slotIndex = String(idx);
    tokenEl.draggable = isAssigned;

    if (playerId) {
      tokenEl.dataset.playerId = String(playerId);
      tokenEl.title = isOutOfPos
        ? `${assignedSlot.name} (${assignedSlot.naturalPosition} jugando en puesto de ${slotPlayer.role}) — Arrastra para cambiar`
        : `${assignedSlot.name} (${assignedSlot.naturalPosition}) — Arrastra para intercambiar o enviar a la banca`;
    } else {
      delete tokenEl.dataset.playerId;
      tokenEl.title = `Puesto vacante (${slotPlayer.role}) — Arrastra un jugador desde la banca aquí`;
    }

    const tx = Math.round(slotPlayer.x * scaleX);
    const ty = Math.round(slotPlayer.y * scaleY);
    movingEls.push(tokenEl);

    requestAnimationFrame(() => {
      tokenEl.style.transform = `translate(${tx}px, ${ty}px) scale(1.05)`;
      const t = setTimeout(() => {
        tokenEl.style.transform = `translate(${tx}px, ${ty}px) scale(1)`;
      }, 1150);
      state.motionBlurTimers.push(t);
    });
  });

  triggerMotionBlurOnElements(movingEls, 1150);

  // Draw synergy links in SVG
  dom.squadSynergyLinks.innerHTML = '';
  (setup.links || []).forEach(([fromIdx, toIdx]) => {
    const p1 = setup.players[fromIdx];
    const p2 = setup.players[toIdx];
    if (!p1 || !p2) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', p1.x);
    line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x);
    line.setAttribute('y2', p2.y);
    dom.squadSynergyLinks.appendChild(line);
  });
}

function renderSelectedPlayerComparison() {
  const comparisons = state.squadOptimization?.playerComparisons || [];
  const comp =
    comparisons.find((c) => c.playerId === state.selectedSquadPlayerId) ||
    comparisons.find((c) => isPlayerCompatibleWithActiveModality(c.position, state.squadModality)) ||
    comparisons[0] ||
    null;

  if (!comp) {
    dom.compPlayerNumber.textContent = '—';
    dom.compPlayerName.textContent = 'Sin jugador seleccionado';
    dom.compPlayerMeta.textContent = 'Registra un jugador o carga la Plantilla Demo';
    dom.compCrackName.textContent = 'Top 100 Mundial / Histórico';
    dom.compCrackStyle.textContent = '75 Cracks de Fútbol 11 + 25 de Futsal';
    dom.compCrackWiki.textContent = '';
    dom.compWhyText.textContent = 'Agrega jugadores a la izquierda para compararlos con las leyendas y cracks actuales.';
    dom.compPotentiateText.textContent = '—';
    dom.compPartnersChips.innerHTML = '';
    return;
  }

  state.selectedSquadPlayerId = comp.playerId;
  dom.compSimilarityBadge.textContent = `${comp.similarityPct || 92}% Similitud`;
  dom.compPlayerNumber.textContent = String(comp.jerseyNumber);
  dom.compPlayerName.textContent = comp.playerName;
  dom.compPlayerMeta.textContent = `Posición: ${comp.position} · Pie ${comp.preferredFoot} · Media ${comp.overall}`;
  dom.compMirrorBadge.textContent = comp.mirrorBadge || 'Top 100';
  dom.compCrackName.textContent = `${comp.similarCrackName} (${comp.similarCrackEra})`;
  dom.compCrackStyle.textContent = `${comp.similarCrackPosition} · ${comp.similarCrackStyle}`;
  dom.compCrackWiki.textContent = comp.similarCrackWiki || '';
  dom.compWhyText.textContent = comp.whySimilar || '';
  dom.compPotentiateText.textContent = comp.whatToPotentiate || '';

  const partners = Array.isArray(comp.bestPartners) ? comp.bestPartners : [];
  dom.compPartnersChips.innerHTML = partners.length
    ? partners.map((pt) => `<span class="source-chip">🤝 ${escapeHtml(pt)}</span>`).join('')
    : '<span class="doc-item-meta">Agrega más compañeros para calcular sociedades.</span>';
}

async function handleCreateCustomPlayer(e) {
  e.preventDefault();
  const payload = {
    name: dom.playerNameInput.value.trim(),
    jerseyNumber: Number(dom.playerNumberInput.value) || 10,
    position: dom.playerPosSelect.value,
    preferredFoot: dom.playerFootSelect.value,
    pace: Number(dom.statPace.value),
    passing: Number(dom.statPassing.value),
    dribbling: Number(dom.statDribbling.value),
    defending: Number(dom.statDefending.value),
    shooting: Number(dom.statShooting.value),
    vision: Number(dom.statVision.value)
  };

  if (!payload.name) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/squad/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const created = await res.json();
    if (!res.ok) throw new Error(created.detail || 'No se pudo guardar el jugador');

    state.selectedSquadPlayerId = created.id;
    dom.playerNameInput.value = '';
    showToast('Jugador registrado', `${created.name} (#${created.jerseyNumber} · ${created.position}) añadido a tu plantilla.`, 'success');
    await refreshSquadAndOptimize();
  } catch (err) {
    showToast('Error al guardar jugador', err.message, 'error');
  }
}

async function handleLoadDemoSquad() {
  if (!dom.loadDemoSquadBtn) return;
  dom.loadDemoSquadBtn.disabled = true;
  dom.loadDemoSquadBtn.textContent = '⏳ Cargando...';

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/squad/demo?modality=${encodeURIComponent(state.squadModality)}`,
      { method: 'POST' }
    );
    const players = await res.json();
    if (!res.ok) throw new Error('Error al cargar plantilla demo');

    state.selectedSquadPlayerId = players[0]?.id || null;
    showToast(
      `Plantilla Demo (${state.squadModality})`,
      `Se cargaron ${players.length} jugadores (titulares + suplentes en banca) comparados con el Top 100.`,
      'success'
    );
    await refreshSquadAndOptimize();
  } catch (err) {
    showToast('Error', err.message, 'error');
  } finally {
    dom.loadDemoSquadBtn.disabled = false;
    dom.loadDemoSquadBtn.textContent = '⚡ Cargar Plantilla Demo';
  }
}

async function handleClearSquad() {
  if (!dom.clearSquadBtn) return;
  dom.clearSquadBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/squad/players`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo vaciar la plantilla');

    state.selectedSquadPlayerId = null;
    state.exportedBoardLineup = null;
    if (dom.idealSquadBanner) {
      dom.idealSquadBanner.classList.add('hidden');
    }
    await refreshSquadAndOptimize(false);
    renderTacticalPitch();
    showToast('🗑️ Plantilla Vaciada', 'Se eliminaron todos los jugadores personalizados de la plantilla.', 'info');
  } catch (err) {
    showToast('Error al vaciar plantilla', err.message, 'error');
  } finally {
    dom.clearSquadBtn.disabled = false;
  }
}

/* ==========================================================================
   8. Event Listeners & Initialization
   ========================================================================== */
function initEvents() {
  // Top view tabs
  dom.tabBtnAssistant.addEventListener('click', () => switchTab('assistant'));
  dom.tabBtnBoard.addEventListener('click', () => switchTab('board'));
  if (dom.tabBtnSquad) {
    dom.tabBtnSquad.addEventListener('click', () => switchTab('squad'));
  }
  dom.goToBoardBtn.addEventListener('click', () => switchTab('board'));
  if (dom.goToSquadBtn) {
    dom.goToSquadBtn.addEventListener('click', () => switchTab('squad'));
  }

  // Ping backend & Wikipedia sync
  dom.backendStatusBtn.addEventListener('click', checkBackendHealth);
  if (dom.syncWikiBtn) {
    dom.syncWikiBtn.addEventListener('click', syncWikipediaKnowledge);
  }

  // Clean System Shutdown button
  if (dom.shutdownSystemBtn) {
    dom.shutdownSystemBtn.addEventListener('click', async () => {
      const confirmed = window.confirm(
        '¿Deseas apagar completamente TacticalPlay RAG (Spring Boot, Vite y contenedor Docker)?'
      );
      if (!confirmed) return;

      dom.shutdownSystemBtn.disabled = true;
      dom.backendStatusBtn.className = 'status-badge offline';
      dom.backendStatusText.textContent = 'Apagando sistema...';

      try {
        await fetch(`${API_BASE_URL}/api/v1/system/shutdown`, { method: 'POST' });
      } catch (ignored) {}

      dom.backendStatusBtn.className = 'status-badge offline';
      dom.backendStatusText.textContent = 'Sistema apagado';
      showToast(
        'Sistema apagado',
        'Spring Boot, Vite y PostgreSQL (Docker) se han detenido limpiamente.',
        'info'
      );
    });
  }

  // Modality buttons (Tab 1 sidebar)
  dom.modalitySelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.modality-btn');
    if (!btn) return;
    setModality(btn.dataset.modality, btn.dataset.players);
  });

  // Modality pills (Tab 2 board)
  dom.boardModalityPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.board-mod-pill');
    if (!pill) return;
    setModality(pill.dataset.modality);
  });

  // Formation dropdown change (Tab 2)
  dom.formationSelect.addEventListener('change', (e) => {
    state.formationIndex = Number(e.target.value) || 0;
    renderTacticalPitch(true);
  });

  // Play Style dropdown change (Tab 2)
  dom.styleSelect.addEventListener('change', (e) => {
    state.playStyle = e.target.value;
    renderTacticalPitch(true);
  });

  // Set Piece Category (4A) & Specific Set Piece (4B) dropdown changes
  if (dom.setpieceCategorySelect) {
    dom.setpieceCategorySelect.addEventListener('change', (e) => {
      clearPlaybackTimers();
      state.setPieceCategory = e.target.value;
      state.setPieceIndex = 0;
      state.setPieceStep = 0;
      populateSetPieceDropdown();
      renderTacticalPitch(true);
      if (state.setPieceCategory !== 'free') {
        playSetPieceAnimation();
      }
    });
  }

  if (dom.setpieceSelect) {
    dom.setpieceSelect.addEventListener('change', (e) => {
      clearPlaybackTimers();
      state.setPieceIndex = Number(e.target.value) || 0;
      state.setPieceStep = 0;
      playSetPieceAnimation();
    });
  }

  if (dom.playSetpieceBtn) {
    dom.playSetpieceBtn.addEventListener('click', () => {
      playSetPieceAnimation();
    });
  }

  if (dom.nextStepSetpieceBtn) {
    dom.nextStepSetpieceBtn.addEventListener('click', () => {
      advanceNextSetPieceStep();
    });
  }

  if (dom.resetSetpieceBtn) {
    dom.resetSetpieceBtn.addEventListener('click', () => {
      resetSetPieceToStart();
    });
  }

  // Next formation button on tactical pitch
  dom.toggleVariantBtn.addEventListener('click', () => {
    clearPlaybackTimers();
    const list = FORMATIONS_BY_MODALITY[state.modality] || FORMATIONS_BY_MODALITY['Futsal'];
    state.formationIndex = (state.formationIndex + 1) % list.length;
    populateFormationDropdown();
    renderTacticalPitch(true);
  });

  // Analyze current board setup with AI Bot CTA (Switches to Tab 1 and sends query)
  dom.analyzeWithBotBtn.addEventListener('click', () => {
    const activeSetup = getActiveFormationSetup();
    const activeSetPiece = getActiveSetPiece();
    const coachInfo = resolveReferenceCoach(state.modality, activeSetup.code, state.playStyle);
    switchTab('assistant');

    const setPieceClause = activeSetPiece
      ? ` y cómo ejecutar la jugada de ${state.setPieceCategory === 'attack' ? 'ataque' : 'defensa'} "${activeSetPiece.name}"`
      : '';

    const prompt = `Míster, ¿cómo debemos jugar en ${state.modality} usando la formación ${activeSetup.code} con un estilo de ${state.playStyle} (tomando como referencia a ${coachInfo.name})${setPieceClause}? Dame 3 claves prácticas de cancha.`;
    sendChatMessage(prompt);
  });

  // Re-adjust pitch coordinates on window resize
  window.addEventListener('resize', () => {
    if (state.activeTab === 'board') {
      renderTacticalPitch();
    } else if (state.activeTab === 'squad') {
      renderSquadPitch();
    }
  });

  // File input & Drag-and-Drop events (optional if PDF card is present)
  if (dom.pdfFileInput && dom.dropZone && dom.pdfUploadForm) {
    dom.pdfFileInput.addEventListener('change', (e) => {
      handleSelectedPdfFile(e.target.files[0]);
    });

    ['dragenter', 'dragover'].forEach((evtName) => {
      dom.dropZone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evtName) => {
      dom.dropZone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropZone.classList.remove('dragover');
      });
    });

    dom.dropZone.addEventListener('drop', (e) => {
      const droppedFile = e.dataTransfer?.files?.[0];
      if (droppedFile) {
        handleSelectedPdfFile(droppedFile);
      }
    });

    dom.pdfUploadForm.addEventListener('submit', uploadPdfDocument);
  }

  // Quick Prompt Chips
  dom.quickPrompts.addEventListener('click', (e) => {
    const chip = e.target.closest('.prompt-chip');
    if (!chip) return;
    sendChatMessage(chip.dataset.prompt);
  });

  // Chat Form Submit
  dom.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendChatMessage(dom.chatInput.value);
  });

  // Clear Chat
  dom.clearChatBtn.addEventListener('click', appendWelcomeMessage);

  // =========================================================================
  // Tab 3 Event Listeners: Custom Squad Builder, Strict Positions & Drag-Drop
  // =========================================================================
  const sliderPairs = [
    [dom.statPace, dom.valPace],
    [dom.statPassing, dom.valPassing],
    [dom.statDribbling, dom.valDribbling],
    [dom.statDefending, dom.valDefending],
    [dom.statShooting, dom.valShooting],
    [dom.statVision, dom.valVision]
  ];
  sliderPairs.forEach(([inputEl, labelEl]) => {
    if (inputEl && labelEl) {
      inputEl.addEventListener('input', () => {
        labelEl.textContent = inputEl.value;
      });
    }
  });

  if (dom.addPlayerForm) {
    dom.addPlayerForm.addEventListener('submit', handleCreateCustomPlayer);
  }

  if (dom.loadDemoSquadBtn) {
    dom.loadDemoSquadBtn.addEventListener('click', handleLoadDemoSquad);
  }

  if (dom.clearSquadBtn) {
    dom.clearSquadBtn.addEventListener('click', handleClearSquad);
  }

  if (dom.resetLineupBtn) {
    dom.resetLineupBtn.addEventListener('click', () => {
      refreshSquadAndOptimize(false);
      showToast('Alineación Auto-ordenada', 'Titulares ubicados en su posición natural y suplentes en la banca.', 'info');
    });
  }

  if (dom.generateIdealSquadBtn) {
    dom.generateIdealSquadBtn.addEventListener('click', handleGenerateIdealSquad);
  }

  if (dom.exportSquadToBoardBtn) {
    dom.exportSquadToBoardBtn.addEventListener('click', handleExportSquadToBoard);
  }

  if (dom.exportMatchPlanBoardBtn) {
    dom.exportMatchPlanBoardBtn.addEventListener('click', () => handleExportPrintableMatchPlan('board'));
  }

  if (dom.exportMatchPlanSquadBtn) {
    dom.exportMatchPlanSquadBtn.addEventListener('click', () => handleExportPrintableMatchPlan('squad'));
  }

  if (dom.closeIdealBannerBtn && dom.idealSquadBanner) {
    dom.closeIdealBannerBtn.addEventListener('click', () => {
      dom.idealSquadBanner.classList.add('hidden');
    });
  }

  if (dom.squadStyleSelect) {
    dom.squadStyleSelect.addEventListener('change', () => {
      if (state.squadOptimization?.idealMode) {
        handleGenerateIdealSquad();
      }
    });
  }

  if (dom.squadModalitySelect) {
    dom.squadModalitySelect.addEventListener('change', (e) => {
      state.squadModality = e.target.value;
      state.squadFormationIndex = 0;
      populatePlayerPositionSelect();
      populateSquadFormationDropdown();
      refreshSquadAndOptimize(false);
    });
  }

  if (dom.squadFormationSelect) {
    dom.squadFormationSelect.addEventListener('change', (e) => {
      state.squadFormationIndex = Number(e.target.value) || 0;
      refreshSquadAndOptimize(Boolean(state.squadOptimization?.idealMode));
    });
  }

  if (dom.squadRosterList) {
    dom.squadRosterList.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.roster-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const idToDelete = Number(deleteBtn.dataset.deleteId);
        if (!idToDelete) return;
        await fetch(`${API_BASE_URL}/api/v1/squad/players/${idToDelete}`, { method: 'DELETE' });
        if (state.selectedSquadPlayerId === idToDelete) {
          state.selectedSquadPlayerId = null;
        }
        await refreshSquadAndOptimize();
        return;
      }

      const item = e.target.closest('.roster-player-item');
      if (item) {
        state.selectedSquadPlayerId = Number(item.dataset.playerId);
        renderSquadRosterList();
        renderSquadPitch();
        renderSquadBench();
        renderSelectedPlayerComparison();
      }
    });
  }

  // Click & Drag-and-Drop on Squad Pitch Tokens
  if (dom.squadPitchTokens) {
    dom.squadPitchTokens.addEventListener('click', (e) => {
      const token = e.target.closest('.player-token');
      if (token && token.dataset.playerId) {
        state.selectedSquadPlayerId = Number(token.dataset.playerId);
        renderSquadRosterList();
        renderSquadPitch();
        renderSquadBench();
        renderSelectedPlayerComparison();
      }
    });

    dom.squadPitchTokens.addEventListener('dragstart', (e) => {
      const token = e.target.closest('.player-token');
      if (!token || !token.dataset.playerId) {
        e.preventDefault();
        return;
      }
      activeDragPayload = {
        source: 'pitch',
        slotIndex: Number(token.dataset.slotIndex),
        playerId: Number(token.dataset.playerId)
      };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(token.dataset.playerId));
      }
    });

    dom.squadPitchTokens.addEventListener('dragover', (e) => {
      const token = e.target.closest('.player-token');
      if (!token) return;
      e.preventDefault();
      token.classList.add('drag-over-target');
    });

    dom.squadPitchTokens.addEventListener('dragleave', (e) => {
      const token = e.target.closest('.player-token');
      if (token) {
        token.classList.remove('drag-over-target');
      }
    });

    dom.squadPitchTokens.addEventListener('drop', (e) => {
      const token = e.target.closest('.player-token');
      if (!token) return;
      e.preventDefault();
      token.classList.remove('drag-over-target');
      const targetSlotIdx = Number(token.dataset.slotIndex);
      if (!Number.isNaN(targetSlotIdx)) {
        handlePitchSlotDrop(targetSlotIdx);
      }
    });
  }

  // Click & Drag-and-Drop on Bench Substitutes
  if (dom.squadBenchSection && dom.squadBenchList) {
    dom.squadBenchList.addEventListener('click', (e) => {
      const chip = e.target.closest('.bench-player-chip');
      if (!chip) return;
      state.selectedSquadPlayerId = Number(chip.dataset.playerId);
      renderSquadRosterList();
      renderSquadPitch();
      renderSquadBench();
      renderSelectedPlayerComparison();
    });

    dom.squadBenchList.addEventListener('dragstart', (e) => {
      const chip = e.target.closest('.bench-player-chip');
      if (!chip || !chip.dataset.playerId) return;
      activeDragPayload = {
        source: 'bench',
        playerId: Number(chip.dataset.playerId)
      };
      chip.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(chip.dataset.playerId));
      }
    });

    dom.squadBenchList.addEventListener('dragend', (e) => {
      const chip = e.target.closest('.bench-player-chip');
      if (chip) chip.classList.remove('dragging');
    });

    dom.squadBenchSection.addEventListener('dragover', (e) => {
      if (activeDragPayload?.source === 'pitch') {
        e.preventDefault();
        dom.squadBenchSection.classList.add('drag-over-bench');
      }
    });

    dom.squadBenchSection.addEventListener('dragleave', () => {
      dom.squadBenchSection.classList.remove('drag-over-bench');
    });

    dom.squadBenchSection.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.squadBenchSection.classList.remove('drag-over-bench');
      handleSendStarterToBench();
    });
  }

  if (dom.askBotAboutSquadBtn) {
    dom.askBotAboutSquadBtn.addEventListener('click', () => {
      const setup = getActiveSquadFormationSetup();
      const lineup = state.squadOptimization?.lineup || [];
      const substitutes = state.squadOptimization?.substitutes || [];

      const startersSummary = lineup
        .filter((s) => s.assigned && s.playerId)
        .map(
          (s) =>
            `${s.name} (#${s.jerseyNumber}, pos. natural ${s.naturalPosition} jugando como ${s.slotRole}${
              s.outOfPosition ? ' [fuera de puesto]' : ''
            })`
        )
        .join(', ');

      const benchSummary = substitutes
        .map((sub) => `${sub.name} (#${sub.jerseyNumber}, ${sub.naturalPosition})`)
        .join(', ');

      setModality(state.squadModality);
      switchTab('assistant');
      const prompt = `Míster, analiza mi alineación personalizada en ${state.squadModality} con formación ${setup.code}. Titulares en cancha: ${startersSummary || 'por definir'}. Suplentes en la banca: ${benchSummary || 'ninguno'}. ¿Qué ajustes, cambios desde la banca o sociedades tácticas me recomiendas?`;
      sendChatMessage(prompt);
    });
  }
}

// Initialize App
initEvents();
populateFormationDropdown();
populateSetPieceDropdown();
populatePlayerPositionSelect();
populateSquadFormationDropdown();
checkBackendHealth();
renderTacticalPitch();
appendWelcomeMessage();
