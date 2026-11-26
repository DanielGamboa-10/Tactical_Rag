package com.tacticalplay.rag.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tacticalplay.rag.model.CustomPlayerEntity;
import com.tacticalplay.rag.model.TopReferencePlayer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.sql.PreparedStatement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class TopPlayersApiService {

    private static final Logger log = LoggerFactory.getLogger(TopPlayersApiService.class);
    private static final String WIKIPEDIA_API_URL = "https://es.wikipedia.org/w/api.php";

    private static final RowMapper<CustomPlayerEntity> CUSTOM_PLAYER_MAPPER = (rs, rowNum) -> new CustomPlayerEntity(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getInt("jersey_number"),
            rs.getString("position"),
            rs.getString("preferred_foot"),
            rs.getInt("pace"),
            rs.getInt("passing"),
            rs.getInt("dribbling"),
            rs.getInt("defending"),
            rs.getInt("shooting"),
            rs.getInt("vision")
    );

    private static final RowMapper<TopReferencePlayer> TOP_PLAYER_MAPPER = (rs, rowNum) -> new TopReferencePlayer(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("sport"),
            rs.getString("position"),
            rs.getString("era"),
            rs.getString("play_style"),
            rs.getInt("pace"),
            rs.getInt("passing"),
            rs.getInt("dribbling"),
            rs.getInt("defending"),
            rs.getInt("shooting"),
            rs.getInt("vision"),
            rs.getString("wiki_extract")
    );

    private record SeedCrack(
            String name,
            String sport,
            String position,
            String era,
            String playStyle,
            int pace,
            int passing,
            int dribbling,
            int defending,
            int shooting,
            int vision
    ) {
    }

    // Catálogo de 100 Referentes Históricos y Actuales (75 Fútbol 11 + 25 Futsal)
    private static final List<SeedCrack> TOP_100_CRACKS = List.of(
            // --- 75 FÚTBOL 11 (Aplicables también como espejo técnico para Fútbol 7 y Fútbol 9) ---
            // Porteros (8)
            new SeedCrack("Manuel Neuer", "Fútbol 11", "POR", "Leyenda Moderna", "Arquero Líbero & Salida Limpia", 68, 90, 72, 92, 55, 92),
            new SeedCrack("Gianluigi Buffon", "Fútbol 11", "POR", "Leyenda Histórica", "Liderazgo & Reflejos bajo Palos", 64, 78, 65, 96, 50, 88),
            new SeedCrack("Iker Casillas", "Fútbol 11", "POR", "Leyenda Histórica", "Achique 1v1 & Reflejos Felinos", 70, 76, 68, 95, 48, 86),
            new SeedCrack("Thibaut Courtois", "Fútbol 11", "POR", "Crack Actual", "Dominio Aéreo & Estirada Larga", 65, 80, 66, 94, 48, 85),
            new SeedCrack("Lev Yashin", "Fútbol 11", "POR", "Leyenda Histórica", "La Araña Negra · Anticipación Total", 72, 78, 70, 97, 50, 89),
            new SeedCrack("Alisson Becker", "Fútbol 11", "POR", "Crack Actual", "Primer Pase Largo & Achique Rápido", 69, 91, 74, 92, 52, 90),
            new SeedCrack("Ederson Moraes", "Fútbol 11", "POR", "Crack Actual", "Golpeo de 60 Metros & Juego de Pies", 70, 95, 78, 89, 60, 93),
            new SeedCrack("Emiliano Martínez", "Fútbol 11", "POR", "Crack Actual", "Juego Aéreo & Especialista en Momentos Clave", 66, 84, 68, 93, 52, 87),

            // Defensas Centrales (12)
            new SeedCrack("Paolo Maldini", "Fútbol 11", "DFC", "Leyenda Histórica", "Lectura Perfecta & Elegancia Defensiva", 86, 85, 80, 98, 65, 92),
            new SeedCrack("Franz Beckenbauer", "Fútbol 11", "DFC", "Leyenda Histórica", "El Káiser · Líbero Conduciendo al Ataque", 84, 93, 86, 96, 76, 96),
            new SeedCrack("Sergio Ramos", "Fútbol 11", "DFC", "Leyenda Moderna", "Agresividad, Anticipación & Cabezazo Goleador", 83, 84, 78, 94, 80, 86),
            new SeedCrack("Virgil van Dijk", "Fútbol 11", "DFC", "Crack Actual", "Dominio Físico, Juego Aéreo & Cambio de Frente", 84, 86, 77, 95, 70, 88),
            new SeedCrack("Carles Puyol", "Fútbol 11", "DFC", "Leyenda Histórica", "Cobertura Total, Coraje & Concentración", 82, 76, 70, 96, 64, 84),
            new SeedCrack("Franco Baresi", "Fútbol 11", "DFC", "Leyenda Histórica", "Maestro del Achique y Línea de Fuera de Juego", 82, 88, 81, 97, 65, 94),
            new SeedCrack("Alessandro Nesta", "Fútbol 11", "DFC", "Leyenda Histórica", "Quite Limpio & Cruce de Élite", 83, 83, 79, 96, 60, 89),
            new SeedCrack("Fabio Cannavaro", "Fútbol 11", "DFC", "Leyenda Histórica", "Salto Explosivo & Anticipación Corta", 84, 78, 76, 96, 58, 86),
            new SeedCrack("Rúben Dias", "Fútbol 11", "DFC", "Crack Actual", "Líder de Bloque & Bloqueo de Remates", 79, 86, 76, 93, 62, 87),
            new SeedCrack("William Saliba", "Fútbol 11", "DFC", "Crack Actual", "Velocidad al Espacio & Salida Serena", 86, 85, 80, 92, 58, 86),
            new SeedCrack("Ronald Araújo", "Fútbol 11", "DFC", "Crack Actual", "Corrector Veloz en Duelos 1v1", 89, 77, 74, 92, 62, 80),
            new SeedCrack("Antonio Rüdiger", "Fútbol 11", "DFC", "Crack Actual", "Marca Férrea & Zancada a Campo Abierto", 88, 80, 75, 92, 66, 82),

            // Laterales y Carrileros (11)
            new SeedCrack("Cafú", "Fútbol 11", "LD", "Leyenda Histórica", "Carrilero Incansable de Ida y Vuelta", 92, 86, 86, 89, 74, 87),
            new SeedCrack("Roberto Carlos", "Fútbol 11", "LI", "Leyenda Histórica", "Potencia Explosiva & Cañonazo de Larga Distancia", 95, 85, 84, 85, 92, 84),
            new SeedCrack("Dani Alves", "Fútbol 11", "LD", "Leyenda Moderna", "Lateral Asociativo & Pared Interior", 89, 90, 89, 84, 78, 91),
            new SeedCrack("Marcelo Vieira", "Fútbol 11", "LI", "Leyenda Moderna", "Fantasía, Regate & Creatividad desde Banda", 86, 90, 94, 80, 79, 91),
            new SeedCrack("Philipp Lahm", "Fútbol 11", "LD", "Leyenda Histórica", "Inteligencia Táctica & Lateral Interior", 84, 91, 86, 92, 70, 94),
            new SeedCrack("Javier Zanetti", "Fútbol 11", "LD", "Leyenda Histórica", "Conducción Potente & Equilibrio Defensivo", 87, 86, 86, 92, 72, 88),
            new SeedCrack("Jordi Alba", "Fútbol 11", "LI", "Leyenda Moderna", "Desmarque al Espacio & Pase Atrás Letal", 92, 86, 84, 82, 74, 87),
            new SeedCrack("Achraf Hakimi", "Fútbol 11", "LD", "Crack Actual", "Flecha en Transición & Llegada al Área", 96, 83, 85, 81, 78, 83),
            new SeedCrack("Trent Alexander-Arnold", "Fútbol 11", "LD", "Crack Actual", "Playmaker desde Banda & Centros Quirúrgicos", 80, 95, 83, 78, 82, 94),
            new SeedCrack("Alphonso Davies", "Fútbol 11", "LI", "Crack Actual", "Velocidad Supersónica & Desborde Exterior", 97, 81, 87, 80, 72, 81),
            new SeedCrack("Theo Hernández", "Fútbol 11", "LI", "Crack Actual", "Potencia Vertical & Rompimiento de Líneas", 95, 82, 85, 81, 80, 82),

            // Mediocentros & Volantes Mixtos (16)
            new SeedCrack("Sergio Busquets", "Fútbol 11", "MCD", "Leyenda Moderna", "Pivote Posicional, Control Orientado & Primer Toque", 66, 93, 86, 91, 68, 96),
            new SeedCrack("Rodri Hernández", "Fútbol 11", "MCD", "Crack Actual", "Eje Total, Distribución & Remate en la Frontal", 76, 93, 86, 92, 84, 95),
            new SeedCrack("N'Golo Kanté", "Fútbol 11", "MCD", "Leyenda Moderna", "Omnipresencia, Robo Limpio & Cobertura", 86, 83, 82, 96, 68, 85),
            new SeedCrack("Casemiro", "Fútbol 11", "MCD", "Leyenda Moderna", "Escudo Defensivo, Duelo Aéreo & Tiro Lejano", 74, 83, 76, 93, 80, 84),
            new SeedCrack("Claude Makélélé", "Fútbol 11", "MCD", "Leyenda Histórica", "El Cinco Puro · Equilibrio y Coberturas", 80, 82, 78, 95, 60, 86),
            new SeedCrack("Xabi Alonso", "Fútbol 11", "MCD", "Leyenda Histórica", "Cambio de Orientación de 50m & Lectura Táctica", 72, 95, 82, 88, 82, 96),
            new SeedCrack("Andrea Pirlo", "Fútbol 11", "MC", "Leyenda Histórica", "Regista · Pases Filtrados & Tiros Libres", 70, 97, 89, 78, 86, 98),
            new SeedCrack("Xavi Hernández", "Fútbol 11", "MC", "Leyenda Histórica", "Director de Orquesta, Giro 360° & Posesión", 75, 98, 92, 78, 78, 99),
            new SeedCrack("Andrés Iniesta", "Fútbol 11", "MC", "Leyenda Histórica", "Conducción Pegada al Pie & Ruptura entre Líneas", 82, 96, 97, 74, 80, 98),
            new SeedCrack("Luka Modrić", "Fútbol 11", "MC", "Leyenda Moderna", "Tres Dedos, Dinamismo & Control del Ritmo", 82, 96, 94, 82, 82, 97),
            new SeedCrack("Toni Kroos", "Fútbol 11", "MC", "Leyenda Moderna", "Precisión del 95% en Pases & Cambio de Banda", 71, 98, 86, 81, 86, 97),
            new SeedCrack("Federico Valverde", "Fútbol 11", "MC", "Crack Actual", "Motor Box-to-Box, Despliegue & Zapatacazo", 91, 87, 84, 86, 88, 87),
            new SeedCrack("Pedri González", "Fútbol 11", "MC", "Crack Actual", "Pausa Entre Líneas & Pase al Hueco", 81, 92, 92, 77, 76, 94),
            new SeedCrack("Declan Rice", "Fútbol 11", "MCD", "Crack Actual", "Recuperación Férrea & Conducción Potente", 82, 86, 82, 91, 78, 86),
            new SeedCrack("Frenkie de Jong", "Fútbol 11", "MC", "Crack Actual", "Conducción para Superar Presión Rival", 84, 90, 91, 82, 74, 91),
            new SeedCrack("Eduardo Camavinga", "Fútbol 11", "MC", "Crack Actual", "Dinamismo, Quite Elástico & Salida", 86, 85, 88, 87, 73, 85),

            // Mediapuntas / Enganches (10)
            new SeedCrack("Diego Armando Maradona", "Fútbol 11", "MCO", "Leyenda Histórica", "Gambeta Imparable, Liderazgo & Genialidad", 92, 96, 99, 60, 94, 98),
            new SeedCrack("Zinedine Zidane", "Fútbol 11", "MCO", "Leyenda Histórica", "Control Orientado, Ruleta & Elegancia Total", 83, 96, 97, 72, 89, 97),
            new SeedCrack("Johan Cruyff", "Fútbol 11", "MCO", "Leyenda Histórica", "Fútbol Total · Movilidad & Visión Táctica", 91, 95, 97, 65, 91, 98),
            new SeedCrack("Ronaldinho Gaúcho", "Fútbol 11", "MCO", "Leyenda Histórica", "Fantasía,Elástica & Pase sin Mirar", 91, 93, 99, 55, 89, 95),
            new SeedCrack("Kevin De Bruyne", "Fútbol 11", "MCO", "Crack Actual", "Centros Tensos, Visión Vertical & Disparo", 82, 98, 88, 72, 90, 98),
            new SeedCrack("Jude Bellingham", "Fútbol 11", "MCO", "Crack Actual", "Llegador de Segunda Línea & Potencia Total", 86, 89, 91, 82, 90, 91),
            new SeedCrack("Kaká", "Fútbol 11", "MCO", "Leyenda Histórica", "Zancada en Conducción Vertical & Definición", 94, 90, 93, 60, 90, 91),
            new SeedCrack("Juan Román Riquelme", "Fútbol 11", "MCO", "Leyenda Histórica", "El Último Diez · Pausa, Protección & Pase Filtrado", 72, 97, 94, 58, 86, 98),
            new SeedCrack("Jamal Musiala", "Fútbol 11", "MCO", "Crack Actual", "Slalom en Baldosas & Giro Rápido en el Área", 88, 86, 96, 66, 84, 89),
            new SeedCrack("Florian Wirtz", "Fútbol 11", "MCO", "Crack Actual", "Asociación al Primer Toque &Último Pase", 86, 92, 93, 68, 85, 94),

            // Extremos (9)
            new SeedCrack("Lionel Messi", "Fútbol 11", "ED", "Leyenda & Crack", "Diagonal Hacia Adentro, Gambeta Corta & Visión Sobrenatural", 91, 98, 99, 58, 97, 99),
            new SeedCrack("Vinícius Júnior", "Fútbol 11", "EI", "Crack Actual", "Desborde 1v1 Explosivo & Diagonal al Área", 97, 85, 95, 55, 88, 87),
            new SeedCrack("Lamine Yamal", "Fútbol 11", "ED", "Crack Actual", "Regate Exterior/Interior & Centros con Rosca", 91, 89, 95, 56, 84, 92),
            new SeedCrack("Neymar Jr", "Fútbol 11", "EI", "Leyenda Moderna", "Regate Creativo, Paredes & Definición Sutil", 91, 91, 98, 52, 89, 93),
            new SeedCrack("Mohamed Salah", "Fútbol 11", "ED", "Crack Actual", "Desmarque en Diagonal & Definición al Segundo Palo", 93, 86, 91, 58, 93, 88),
            new SeedCrack("Arjen Robben", "Fútbol 11", "ED", "Leyenda Moderna", "Enganche Hacia Adentro y Zurda al Ángulo", 94, 83, 93, 54, 92, 85),
            new SeedCrack("Franck Ribéry", "Fútbol 11", "EI", "Leyenda Moderna", "Cambio de Ritmo Corto & Asociación con el Lateral", 92, 88, 94, 60, 85, 89),
            new SeedCrack("Bukayo Saka", "Fútbol 11", "ED", "Crack Actual", "Inteligencia en Banda, Toma de Decisión & Gol", 89, 88, 91, 68, 87, 89),
            new SeedCrack("Luis Díaz", "Fútbol 11", "EI", "Crack Actual", "Presión Intensa, Gambeta en Velocidad & Diagonal", 93, 82, 92, 65, 85, 83),

            // Delanteros Centros (9)
            new SeedCrack("Cristiano Ronaldo", "Fútbol 11", "DC", "Leyenda & Crack", "Depredador Total, Salto Dominante & Remate con Ambas Piernas", 93, 85, 91, 55, 99, 88),
            new SeedCrack("Pelé", "Fútbol 11", "DC", "Leyenda Histórica", "O Rei · Delantero Total, Cabezazo, Pared y Definición", 94, 93, 97, 64, 98, 96),
            new SeedCrack("Ronaldo Nazário", "Fútbol 11", "DC", "Leyenda Histórica", "El Fenómeno · Explosividad, Bicicleta y Regate al Arquero", 97, 84, 97, 50, 98, 88),
            new SeedCrack("Kylian Mbappé", "Fútbol 11", "DC", "Crack Actual", "Desmarque al Espacio a 37 km/h & Definición al Primer Palo", 99, 85, 94, 52, 94, 87),
            new SeedCrack("Erling Haaland", "Fútbol 11", "DC", "Crack Actual", "Potencia Física, Desmarque Corto & Un Toque Letal", 94, 76, 82, 58, 98, 82),
            new SeedCrack("Karim Benzema", "Fútbol 11", "DC", "Leyenda Moderna", "Nueve Asociativo que Baja a Crear & Define", 84, 91, 91, 58, 94, 94),
            new SeedCrack("Robert Lewandowski", "Fútbol 11", "DC", "Crack Actual", "Control en el Área, Juego de Espaldas & Remate", 82, 84, 87, 58, 96, 87),
            new SeedCrack("Thierry Henry", "Fútbol 11", "DC", "Leyenda Histórica", "Caída a Banda Izquierda & Definición Abriendo el Pie", 96, 88, 94, 56, 95, 90),
            new SeedCrack("Harry Kane", "Fútbol 11", "DC", "Crack Actual", "Goleador Letal con Pase Largo de Enganche", 76, 92, 85, 62, 96, 94),

            // --- 25 FUTSAL (Leyendas y Cracks Mundiales de Fútbol Sala 40x20) ---
            new SeedCrack("Falcão (Futsal)", "Futsal", "ALA", "Leyenda Histórica", "El Rey del Futsal · Pisada, Lambretta y Gol Imposible", 92, 96, 99, 72, 97, 98),
            new SeedCrack("Ricardinho", "Futsal", "ALA", "Leyenda Histórica", "O Mágico · Regate en Corto, Rabona e Intensidad", 94, 95, 99, 82, 94, 97),
            new SeedCrack("Manoel Tobias", "Futsal", "ALA", "Leyenda Histórica", "Universal Completo · Potencia, Marca y Cañonazo", 93, 94, 95, 86, 96, 95),
            new SeedCrack("Ferrão", "Futsal", "PIV", "Crack Actual", "Mejor Pívot del Mundo · Giro de Espaldas y Fusil", 86, 85, 90, 76, 98, 88),
            new SeedCrack("Pito (Jean Pierre Guisel)", "Futsal", "PIV", "Crack Actual", "Pívot Móvil con Regate de Ala y Potencia", 91, 89, 95, 78, 94, 91),
            new SeedCrack("Sergio Lozano", "Futsal", "CIE", "Leyenda Moderna", "El Búfalo · Cierre Llegador con Disparo Demoledor", 87, 90, 88, 93, 95, 92),
            new SeedCrack("Carlos Ortiz", "Futsal", "CIE", "Leyenda Moderna", "Cierre Posicional · Lectura de Líneas y Salida Limpia", 82, 93, 86, 96, 84, 95),
            new SeedCrack("Kike Boned", "Futsal", "CIE", "Leyenda Histórica", "El Mariscal del Cierre · Orden Táctico y Primer Pase", 80, 95, 85, 97, 86, 97),
            new SeedCrack("Schumacher (Futsal)", "Futsal", "CIE", "Leyenda Histórica", "Cierre Brasileño con Zancada y Conducción Ofensiva", 90, 92, 91, 93, 92, 93),
            new SeedCrack("Luis Amado", "Futsal", "POR", "Leyenda Histórica", "La Cruz Perfecta · Mejor Portero de la Historia del Futsal", 78, 86, 76, 98, 65, 92),
            new SeedCrack("Leo Higuita", "Futsal", "POR", "Crack Actual", "Revolución del Portero-Jugador · Incorporación y Remate", 84, 95, 88, 93, 90, 96),
            new SeedCrack("Paco Sedano", "Futsal", "POR", "Leyenda Moderna", "Reflejos en 1v1 y Saque Largo de Gol", 79, 91, 78, 96, 75, 93),
            new SeedCrack("Javi Rodríguez", "Futsal", "ALA", "Leyenda Histórica", "Capitán Total · Llegada al Segundo Palo y Carácter", 89, 90, 90, 88, 94, 92),
            new SeedCrack("Konstantin Eremenko", "Futsal", "PIV", "Leyenda Histórica", "Goleador Histórico Ruso · Remate Imparable con Ambas Piernas", 91, 86, 90, 75, 99, 89),
            new SeedCrack("Lenísio", "Futsal", "PIV", "Leyenda Histórica", "Pívot Técnico · Definición de Primera y Tiro Libre", 87, 89, 92, 76, 97, 91),
            new SeedCrack("Wilde Gomes", "Futsal", "PIV", "Leyenda Moderna", "Definidor Letal en el Área y Movimiento al Primer Palo", 88, 84, 88, 76, 97, 87),
            new SeedCrack("Vinícius Elías", "Futsal", "ALA", "Leyenda Histórica", "Universal de Rotación 1-4-0 · Asistencia y Gol", 90, 94, 93, 88, 92, 94),
            new SeedCrack("Rodrigo Hardy (Capita)", "Futsal", "CIE", "Crack Actual", "Cierre Goleador · Especialista en Faltas y Físico", 85, 90, 86, 93, 96, 91),
            new SeedCrack("Dyego Zuffo", "Futsal", "ALA", "Crack Actual", "Rey del 1v1 en Banda y Diagonal hacia el Centro", 92, 92, 96, 82, 92, 93),
            new SeedCrack("Adolfo Fernández", "Futsal", "ALA", "Crack Actual", "Presión Inagotable, Corte a la Espalda y Gol", 94, 88, 90, 92, 91, 90),
            new SeedCrack("Catela (Juan José Camacho)", "Futsal", "ALA", "Crack Actual", "Zurda Mágica, Pisada en Corto y Visión de Pase", 90, 94, 96, 78, 91, 95),
            new SeedCrack("Zicky Té", "Futsal", "PIV", "Crack Actual", "Potencia Joven en el Pívot, Giro Rápido y Asistencia", 90, 88, 92, 80, 93, 89),
            new SeedCrack("Erick Mendonça", "Futsal", "CIE", "Crack Actual", "Universal Defensivo Portugués · Equilibrio en 1-2-2 y 1-4-0", 88, 90, 88, 94, 86, 91),
            new SeedCrack("Cristian Borruto", "Futsal", "ALA", "Crack Actual", "Intensidad Argentina, Presión Alta y Definición al Segundo Palo", 93, 87, 91, 89, 92, 88),
            new SeedCrack("Leandro Cuzzolino", "Futsal", "ALA", "Leyenda Moderna", "Especialista en Balón Parado, Zurda Potente y Cobertura", 86, 92, 89, 89, 94, 92)
    );

    private final JdbcTemplate jdbcTemplate;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public TopPlayersApiService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(8));
        factory.setReadTimeout(Duration.ofSeconds(8));

        this.restClient = RestClient.builder()
                .baseUrl(WIKIPEDIA_API_URL)
                .requestFactory(factory)
                .defaultHeader("User-Agent", "TacticalPlayRAG/1.0 (https://github.com/DanielGamboa-10/Tactical_Rag)")
                .build();
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(3)
    public void seedTop100PlayersOnStartup() {
        try {
            Integer existingCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM top_reference_players", Integer.class);
            if (existingCount == null || existingCount < TOP_100_CRACKS.size()) {
                String sql = """
                        INSERT INTO top_reference_players
                        (name, sport, position, era, play_style, pace, passing, dribbling, defending, shooting, vision, wiki_extract)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (name) DO NOTHING
                        """;

                jdbcTemplate.batchUpdate(sql, TOP_100_CRACKS, TOP_100_CRACKS.size(), (ps, c) -> {
                    ps.setString(1, c.name());
                    ps.setString(2, c.sport());
                    ps.setString(3, c.position());
                    ps.setString(4, c.era());
                    ps.setString(5, c.playStyle());
                    ps.setInt(6, c.pace());
                    ps.setInt(7, c.passing());
                    ps.setInt(8, c.dribbling());
                    ps.setInt(9, c.defending());
                    ps.setInt(10, c.shooting());
                    ps.setInt(11, c.vision());
                    ps.setString(12, "Referente mundial de " + c.sport() + " (" + c.position() + ") reconocido por: " + c.playStyle());
                });
                log.info("Catálogo Top 100 Jugadores (75 Fútbol 11 + 25 Futsal) inicializado en PostgreSQL.");
            }

            // Enriquecer en segundo plano extractos biográficos reales desde Wikipedia API
            Thread wikiEnrichThread = new Thread(this::enrichSampleExtractsFromWikipedia, "wiki-top100-enricher");
            wikiEnrichThread.setDaemon(true);
            wikiEnrichThread.start();
        } catch (Exception ex) {
            log.warn("No se pudo inicializar el catálogo Top 100 Jugadores: {}", ex.getMessage());
        }
    }

    private void enrichSampleExtractsFromWikipedia() {
        List<String> featuredNames = List.of(
                "Lionel Messi", "Cristiano Ronaldo", "Zinedine Zidane", "Andrés Iniesta",
                "Xavi Hernández", "Paolo Maldini", "Sergio Busquets", "Ricardinho", "Manuel Neuer"
        );
        for (String playerName : featuredNames) {
            try {
                String responseJson = restClient.get()
                        .uri(uriBuilder -> uriBuilder
                                .queryParam("action", "query")
                                .queryParam("prop", "extracts")
                                .queryParam("exintro", "1")
                                .queryParam("explaintext", "1")
                                .queryParam("redirects", "1")
                                .queryParam("format", "json")
                                .queryParam("titles", playerName)
                                .build())
                        .retrieve()
                        .body(String.class);

                JsonNode pagesNode = objectMapper.readTree(responseJson).path("query").path("pages");
                Iterator<JsonNode> elements = pagesNode.elements();
                if (elements.hasNext()) {
                    String extract = elements.next().path("extract").asText("").trim();
                    if (!extract.isBlank()) {
                        String shortExtract = extract.length() > 320 ? extract.substring(0, 320).trim() + "..." : extract;
                        jdbcTemplate.update(
                                "UPDATE top_reference_players SET wiki_extract = ? WHERE name = ?",
                                shortExtract,
                                playerName
                        );
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }

    // =========================================================================
    // CRUD de Jugadores Personalizados del Usuario ("Tu Propia Plantilla")
    // =========================================================================

    public List<CustomPlayerEntity> getAllCustomPlayers() {
        return getAllCustomPlayers("demo-club");
    }

    public List<CustomPlayerEntity> getAllCustomPlayers(String tenantId) {
        String effectiveTenant = (tenantId != null && !tenantId.isBlank()) ? tenantId : "demo-club";
        return jdbcTemplate.query(
                "SELECT * FROM custom_players WHERE tenant_id = ? ORDER BY jersey_number ASC, id ASC",
                CUSTOM_PLAYER_MAPPER,
                effectiveTenant
        );
    }

    public CustomPlayerEntity createCustomPlayer(CustomPlayerEntity player) {
        return createCustomPlayer(player, "demo-club");
    }

    public CustomPlayerEntity createCustomPlayer(CustomPlayerEntity player, String tenantId) {
        String effectiveTenant = (tenantId != null && !tenantId.isBlank()) ? tenantId : "demo-club";
        String sql = """
                INSERT INTO custom_players
                (tenant_id, name, jersey_number, position, preferred_foot, pace, passing, dribbling, defending, shooting, vision)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql, new String[]{"id"});
            ps.setString(1, effectiveTenant);
            ps.setString(2, player.name());
            ps.setInt(3, player.jerseyNumber());
            ps.setString(4, player.position().toUpperCase());
            ps.setString(5, player.preferredFoot() != null ? player.preferredFoot() : "Derecho");
            ps.setInt(6, clampStat(player.pace()));
            ps.setInt(7, clampStat(player.passing()));
            ps.setInt(8, clampStat(player.dribbling()));
            ps.setInt(9, clampStat(player.defending()));
            ps.setInt(10, clampStat(player.shooting()));
            ps.setInt(11, clampStat(player.vision()));
            return ps;
        }, keyHolder);

        Long generatedId = keyHolder.getKey() != null ? keyHolder.getKey().longValue() : null;
        return new CustomPlayerEntity(
                generatedId,
                player.name(),
                player.jerseyNumber(),
                player.position().toUpperCase(),
                player.preferredFoot() != null ? player.preferredFoot() : "Derecho",
                clampStat(player.pace()),
                clampStat(player.passing()),
                clampStat(player.dribbling()),
                clampStat(player.defending()),
                clampStat(player.shooting()),
                clampStat(player.vision())
        );
    }

    public void deleteCustomPlayer(Long id) {
        deleteCustomPlayer(id, "demo-club");
    }

    public void deleteCustomPlayer(Long id, String tenantId) {
        String effectiveTenant = (tenantId != null && !tenantId.isBlank()) ? tenantId : "demo-club";
        jdbcTemplate.update("DELETE FROM custom_players WHERE id = ? AND tenant_id = ?", id, effectiveTenant);
    }

    public void clearAllCustomPlayers() {
        clearAllCustomPlayers("demo-club");
    }

    public void clearAllCustomPlayers(String tenantId) {
        String effectiveTenant = (tenantId != null && !tenantId.isBlank()) ? tenantId : "demo-club";
        jdbcTemplate.update("DELETE FROM custom_players WHERE tenant_id = ?", effectiveTenant);
    }

    public List<CustomPlayerEntity> seedDemoSquad() {
        return seedDemoSquad("Fútbol 11", "demo-club");
    }

    public List<CustomPlayerEntity> seedDemoSquad(String modality) {
        return seedDemoSquad(modality, "demo-club");
    }

    public List<CustomPlayerEntity> seedDemoSquad(String modality, String tenantId) {
        String effectiveTenant = (tenantId != null && !tenantId.isBlank()) ? tenantId : "demo-club";
        jdbcTemplate.update("DELETE FROM custom_players WHERE tenant_id = ?", effectiveTenant);
        // Sembramos tanto la plantilla completa de Fútbol 11/9/7 como la de Futsal para que al cambiar
        // de modalidad o formación todos los puestos tengan jugadores compatibles y suplentes en la banca.
        List<CustomPlayerEntity> demoPlayers = List.of(
                // === Plantilla Fútbol 11 / 9 / 7 (18 jugadores con distintos perfiles tácticos para rotar por estilo) ===
                new CustomPlayerEntity(null, "David Ospina", 1, "POR", "Derecho", 74, 88, 76, 90, 58, 90),
                new CustomPlayerEntity(null, "Camilo Vargas", 12, "POR", "Derecho", 78, 82, 72, 92, 60, 84),
                new CustomPlayerEntity(null, "Carlos Cuesta", 4, "DFC", "Derecho", 88, 82, 77, 90, 64, 83),
                new CustomPlayerEntity(null, "Jhon Lucumí", 3, "DFC", "Izquierdo", 83, 89, 82, 89, 62, 88),
                new CustomPlayerEntity(null, "Yerry Mina", 13, "DFC", "Derecho", 73, 77, 70, 94, 74, 78),
                new CustomPlayerEntity(null, "Davinson Sánchez", 23, "DFC", "Derecho", 89, 80, 75, 91, 66, 80),
                new CustomPlayerEntity(null, "Daniel Muñoz", 2, "LD", "Derecho", 92, 83, 84, 89, 82, 84),
                new CustomPlayerEntity(null, "Santiago Arias", 21, "LD", "Derecho", 84, 88, 86, 84, 74, 87),
                new CustomPlayerEntity(null, "Johan Mojica", 17, "LI", "Izquierdo", 93, 81, 84, 84, 77, 81),
                new CustomPlayerEntity(null, "Deiver Machado", 26, "LI", "Izquierdo", 88, 87, 86, 80, 74, 86),
                new CustomPlayerEntity(null, "Jefferson Lerma", 6, "MCD", "Derecho", 83, 85, 79, 93, 79, 85),
                new CustomPlayerEntity(null, "Kevin Castaño", 5, "MCD", "Derecho", 81, 91, 86, 85, 75, 92),
                new CustomPlayerEntity(null, "Richard Ríos", 8, "MC", "Derecho", 89, 88, 93, 84, 85, 89),
                new CustomPlayerEntity(null, "Mateus Uribe", 15, "MC", "Derecho", 84, 83, 80, 91, 83, 84),
                new CustomPlayerEntity(null, "James Rodríguez", 10, "MCO", "Izquierdo", 75, 97, 91, 62, 93, 98),
                new CustomPlayerEntity(null, "Juanfer Quintero", 20, "MCO", "Izquierdo", 77, 95, 94, 58, 90, 96),
                new CustomPlayerEntity(null, "Jorge Carrascal", 14, "MCO", "Ambidiestro", 88, 88, 93, 72, 82, 89),
                new CustomPlayerEntity(null, "Jhon Arias", 11, "ED", "Derecho", 91, 89, 91, 83, 84, 89),
                new CustomPlayerEntity(null, "Carlos Gómez", 18, "ED", "Derecho", 95, 81, 90, 68, 86, 82),
                new CustomPlayerEntity(null, "Luis Díaz", 7, "EI", "Derecho", 95, 85, 95, 72, 89, 86),
                new CustomPlayerEntity(null, "Luis Sinisterra", 16, "EI", "Derecho", 92, 84, 92, 74, 87, 84),
                new CustomPlayerEntity(null, "Jhon Córdoba", 9, "DC", "Derecho", 89, 79, 83, 66, 93, 81),
                new CustomPlayerEntity(null, "Rafael Santos Borré", 19, "DC", "Derecho", 87, 87, 86, 82, 86, 88),
                new CustomPlayerEntity(null, "Jhon Durán", 24, "DC", "Izquierdo", 92, 77, 84, 64, 92, 79),

                // === Plantilla Futsal 5v5 (9 jugadores con perfiles diferenciados) ===
                new CustomPlayerEntity(null, "Santiago Higuita", 1, "POR", "Derecho", 82, 92, 84, 92, 80, 93),
                new CustomPlayerEntity(null, "Didier Plana", 12, "POR", "Derecho", 78, 82, 76, 95, 68, 85),
                new CustomPlayerEntity(null, "Mateo Ortiz", 4, "CIE", "Derecho", 84, 93, 86, 91, 86, 94),
                new CustomPlayerEntity(null, "Nicolás Lozano", 5, "CIE", "Derecho", 89, 85, 83, 95, 88, 86),
                new CustomPlayerEntity(null, "Lucas Ricardinho", 10, "ALA", "Izquierdo", 93, 95, 97, 80, 91, 96),
                new CustomPlayerEntity(null, "Julián Falcão", 7, "ALA", "Derecho", 92, 91, 95, 78, 95, 92),
                new CustomPlayerEntity(null, "Adolfo Bastezini", 8, "ALA", "Derecho", 95, 87, 90, 93, 90, 89),
                new CustomPlayerEntity(null, "Sebastián Ferrão", 9, "PIV", "Derecho", 86, 83, 88, 75, 96, 86),
                new CustomPlayerEntity(null, "Tomás Pito", 14, "PIV", "Ambidiestro", 91, 90, 94, 83, 89, 92)
        );

        List<CustomPlayerEntity> saved = new ArrayList<>();
        for (CustomPlayerEntity p : demoPlayers) {
            saved.add(createCustomPlayer(p, effectiveTenant));
        }
        boolean isFutsal = "Futsal".equalsIgnoreCase(modality);
        return saved.stream()
                .filter(p -> isPlayerCompatibleWithModality(p.position(), isFutsal))
                .toList();
    }

    public List<TopReferencePlayer> getAllTopReferencePlayers() {
        return jdbcTemplate.query("SELECT * FROM top_reference_players ORDER BY id ASC", TOP_PLAYER_MAPPER);
    }

    // =========================================================================
    // Algoritmo de Optimización Posicional, Sinergia Global y Comparativa Top 100
    // =========================================================================

    public Map<String, Object> optimizeSquadAndCompare(
            String modality,
            String formation,
            List<String> targetSlots
    ) {
        return optimizeSquadAndCompare(modality, formation, targetSlots, "Posesión", false, "demo-club");
    }

    public Map<String, Object> optimizeSquadAndCompare(
            String modality,
            String formation,
            List<String> targetSlots,
            String playStyle,
            boolean idealChemistryMode
    ) {
        return optimizeSquadAndCompare(modality, formation, targetSlots, playStyle, idealChemistryMode, "demo-club");
    }

    public Map<String, Object> optimizeSquadAndCompare(
            String modality,
            String formation,
            List<String> targetSlots,
            String playStyle,
            boolean idealChemistryMode,
            String tenantId
    ) {
        List<CustomPlayerEntity> userPlayers = getAllCustomPlayers(tenantId);
        List<TopReferencePlayer> top100 = getAllTopReferencePlayers();
        String activeStyle = (playStyle != null && !playStyle.isBlank()) ? playStyle : "Posesión";

        int requiredCount = switch (modality != null ? modality : "Fútbol 11") {
            case "Futsal" -> 5;
            case "Fútbol 7" -> 7;
            case "Fútbol 9" -> 9;
            default -> 11;
        };

        List<String> slots = (targetSlots != null && !targetSlots.isEmpty())
                ? targetSlots
                : defaultSlotsForModality(modality, requiredCount);

        // 1. Calcular comparativa Top 100 y mejores socios para TODOS los jugadores registrados
        List<Map<String, Object>> comparisons = new ArrayList<>();
        for (CustomPlayerEntity player : userPlayers) {
            comparisons.add(buildPlayerComparison(player, userPlayers, top100, modality));
        }

        boolean isFutsalModality = "Futsal".equalsIgnoreCase(modality);
        List<CustomPlayerEntity> compatiblePlayers = userPlayers.stream()
                .filter(p -> isPlayerCompatibleWithModality(p.position(), isFutsalModality))
                .sorted(Comparator.comparingInt(CustomPlayerEntity::overallRating).reversed())
                .toList();

        Set<Long> assignedIds = new HashSet<>();
        List<Map<String, Object>> lineup = new ArrayList<>();
        List<CustomPlayerEntity> chosenStartersBySlot = new ArrayList<>(Collections.nCopies(slots.size(), null));
        List<String> tacticalRotations = new ArrayList<>();
        int totalFitScore = 0;

        for (int i = 0; i < slots.size(); i++) {
            String slotRole = slots.get(i);
            CustomPlayerEntity bestCandidate = null;
            int bestScore = -1;

            // Identificar también quién habría ganado solo por media individual pura (para explicar rotaciones tácticas)
            CustomPlayerEntity highestOverallCandidate = null;
            for (CustomPlayerEntity candidate : compatiblePlayers) {
                if (assignedIds.contains(candidate.id())) {
                    continue;
                }
                if (!isStrictNaturalMatch(candidate.position(), slotRole)) {
                    continue;
                }
                if (highestOverallCandidate == null || candidate.overallRating() > highestOverallCandidate.overallRating()) {
                    highestOverallCandidate = candidate;
                }

                int candidateScore = idealChemistryMode
                        ? computeIdealChemistryCandidateScore(candidate, slotRole, i, slots.size(), activeStyle, chosenStartersBySlot)
                        : computePositionFitScore(candidate, slotRole);

                if (candidateScore > bestScore) {
                    bestScore = candidateScore;
                    bestCandidate = candidate;
                }
            }

            Map<String, Object> slotAssignment = new LinkedHashMap<>();
            slotAssignment.put("slotIndex", i);
            slotAssignment.put("slotRole", slotRole);

            if (bestCandidate != null) {
                assignedIds.add(bestCandidate.id());
                chosenStartersBySlot.set(i, bestCandidate);
                int displayFit = Math.min(99, Math.max(78, bestScore));
                totalFitScore += displayFit;

                if (idealChemistryMode
                        && highestOverallCandidate != null
                        && !highestOverallCandidate.id().equals(bestCandidate.id())
                        && highestOverallCandidate.overallRating() >= bestCandidate.overallRating()) {
                    tacticalRotations.add(String.format(
                            "En %s entra %s (#%d) por encima de %s (#%d, Media %d) porque su perfil (%s, Pie %s) aporta mayor química colectiva para el estilo '%s'.",
                            slotRole,
                            bestCandidate.name(),
                            bestCandidate.jerseyNumber(),
                            highestOverallCandidate.name(),
                            highestOverallCandidate.jerseyNumber(),
                            highestOverallCandidate.overallRating(),
                            detectTopAttributeLabel(bestCandidate),
                            bestCandidate.preferredFoot(),
                            activeStyle
                    ));
                }

                slotAssignment.put("assigned", true);
                slotAssignment.put("playerId", bestCandidate.id());
                slotAssignment.put("name", bestCandidate.name());
                slotAssignment.put("jerseyNumber", bestCandidate.jerseyNumber());
                slotAssignment.put("naturalPosition", bestCandidate.position());
                slotAssignment.put("preferredFoot", bestCandidate.preferredFoot());
                slotAssignment.put("overall", bestCandidate.overallRating());
                slotAssignment.put("outOfPosition", false);
                slotAssignment.put("fitScore", displayFit);
            } else {
                slotAssignment.put("assigned", false);
                slotAssignment.put("playerId", null);
                slotAssignment.put("name", "Vacante · " + slotRole);
                slotAssignment.put("jerseyNumber", "+");
                slotAssignment.put("naturalPosition", slotRole);
                slotAssignment.put("preferredFoot", "Derecho");
                slotAssignment.put("overall", 0);
                slotAssignment.put("outOfPosition", false);
                slotAssignment.put("fitScore", 60);
                totalFitScore += 60;
            }
            lineup.add(slotAssignment);
        }

        List<Map<String, Object>> substitutes = new ArrayList<>();
        for (CustomPlayerEntity p : compatiblePlayers) {
            if (!assignedIds.contains(p.id())) {
                Map<String, Object> sub = new LinkedHashMap<>();
                sub.put("playerId", p.id());
                sub.put("name", p.name());
                sub.put("jerseyNumber", p.jerseyNumber());
                sub.put("position", p.position());
                sub.put("naturalPosition", p.position());
                sub.put("preferredFoot", p.preferredFoot());
                sub.put("overall", p.overallRating());
                substitutes.add(sub);
            }
        }

        List<CustomPlayerEntity> activeStarters = chosenStartersBySlot.stream()
                .filter(Objects::nonNull)
                .toList();
        List<String> keyPartnerships = buildIdealKeyPartnerships(activeStarters, activeStyle);
        int collectiveBonus = idealChemistryMode && activeStarters.size() >= 3 ? 3 : 0;
        int globalSynergyPct = slots.isEmpty()
                ? 80
                : Math.min(99, Math.max(50, Math.round((float) totalFitScore / slots.size()) + collectiveBonus));

        String idealExplanation = buildIdealLineupExplanation(
                modality,
                formation,
                activeStyle,
                activeStarters,
                substitutes,
                keyPartnerships,
                tacticalRotations
        );

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("modality", modality);
        response.put("formation", formation);
        response.put("playStyle", activeStyle);
        response.put("idealMode", idealChemistryMode);
        response.put("totalPlayersRegistered", compatiblePlayers.size());
        response.put("globalSynergy", globalSynergyPct);
        response.put("lineup", lineup);
        response.put("substitutes", substitutes);
        response.put("keyPartnerships", keyPartnerships);
        response.put("tacticalRotations", tacticalRotations);
        response.put("idealExplanation", idealExplanation);
        response.put("playerComparisons", comparisons);
        return response;
    }

    private int computeIdealChemistryCandidateScore(
            CustomPlayerEntity candidate,
            String slotRole,
            int slotIndex,
            int totalSlots,
            String playStyle,
            List<CustomPlayerEntity> currentStarters
    ) {
        String style = playStyle != null ? playStyle.toLowerCase() : "posesión";
        String slot = slotRole != null ? slotRole.toUpperCase() : "";

        // 1. Puntuación ponderada fuertemente por Estilo de Juego para rotar titulares/suplentes según el plan táctico
        double styleScore;
        if (style.contains("posesión") || style.contains("posesion")) {
            // Posesión & Juego de Posición: Prioriza Pase + Visión + Regate en todas las líneas (incluso POR y DFC/CIE)
            styleScore = candidate.passing() * 0.42
                    + candidate.vision() * 0.36
                    + candidate.dribbling() * 0.22;
        } else if (style.contains("presión") || style.contains("presion") || style.contains("gegenpressing")) {
            // Presión Alta (Gegenpressing): Prioriza Ritmo + Defensa para sostener el achique en campo rival
            styleScore = candidate.pace() * 0.46
                    + candidate.defending() * 0.42
                    + candidate.passing() * 0.12;
        } else if (style.contains("bloque") || style.contains("bajo") || style.contains("contra")) {
            // Bloque Bajo & Contragolpe: Máxima Defensa atrás y máximo Ritmo + Tiro arriba
            if (isDefensiveRole(slot) || slot.contains("MCD") || slot.contains("PIV") || slot.contains("MC") || slot.contains("POR")) {
                styleScore = candidate.defending() * 0.68
                        + candidate.passing() * 0.18
                        + candidate.vision() * 0.14;
            } else {
                styleScore = candidate.pace() * 0.48
                        + candidate.shooting() * 0.40
                        + candidate.dribbling() * 0.12;
            }
        } else if (style.contains("directo") || style.contains("vertical")) {
            // Juego Directo & Vertical: Prioriza Tiro + Pase largo + Ritmo en puntas y lanzadores
            if (isDefensiveRole(slot) || slot.contains("MC") || slot.contains("MCO") || slot.contains("ENG") || slot.contains("CIE")) {
                styleScore = candidate.passing() * 0.46
                        + candidate.vision() * 0.34
                        + candidate.shooting() * 0.20;
            } else {
                styleScore = candidate.shooting() * 0.48
                        + candidate.pace() * 0.38
                        + candidate.passing() * 0.14;
            }
        } else {
            // Rotación Dinámica: Prioriza Regate + Visión + Ritmo (jugadores polivalentes de movilidad constante)
            styleScore = candidate.dribbling() * 0.38
                    + candidate.vision() * 0.32
                    + candidate.pace() * 0.30;
        }

        // 2. Adecuación de pie hábil según el costado de la cancha
        int footBonus = computeFootSuitabilityBonus(candidate, slot, slotIndex, totalSlots);

        // 3. Complementariedad real con los compañeros ya ubicados en cancha
        int partnerBonus = 0;
        int partnerCount = 0;
        for (CustomPlayerEntity starter : currentStarters) {
            if (starter == null) continue;
            partnerBonus += computeTacticalComplementarity(starter, candidate, style);
            partnerCount++;
        }
        int normalizedPartnerBonus = partnerCount > 0 ? Math.min(8, (partnerBonus / partnerCount) / 12) : 3;

        return (int) Math.min(99, Math.round(styleScore * 0.90 + footBonus + normalizedPartnerBonus));
    }

    private int computeFootSuitabilityBonus(CustomPlayerEntity p, String slotRole, int slotIndex, int totalSlots) {
        String foot = p.preferredFoot() != null ? p.preferredFoot().toUpperCase() : "DERECHO";
        if (foot.contains("AMBIDIESTRO")) {
            return 5;
        }
        boolean isLeftFoot = foot.contains("IZQUIERDO");
        // Costado izquierdo natural (LI, DFC izquierdo, ALA-I, CAR-I)
        if (slotRole.contains("-I") || slotRole.equals("LI") || slotRole.equals("MI")) {
            return isLeftFoot ? 5 : 1;
        }
        // Extremo izquierdo a perfil cambiado (EI diestro que recorta hacia adentro para rematar)
        if (slotRole.equals("EI")) {
            return !isLeftFoot ? 5 : 3;
        }
        // Extremo derecho o enganche a perfil cambiado (ED/MCO zurdo con diagonal interior)
        if (slotRole.equals("ED") || slotRole.equals("MCO")) {
            return isLeftFoot ? 5 : 4;
        }
        // Costado derecho natural (LD, DFC derecho, ALA-D)
        if (slotRole.contains("-D") || slotRole.equals("LD") || slotRole.equals("MD")) {
            return !isLeftFoot ? 5 : 1;
        }
        // Si hay dos puestos iguales (ej. dos DFC o dos MC), premiar perfil zurdo en el primero y diestro en el segundo
        if (slotRole.equals("DFC") || slotRole.equals("MC") || slotRole.equals("ALA")) {
            boolean preferLeft = (slotIndex % 2 == 1);
            return (preferLeft == isLeftFoot) ? 4 : 2;
        }
        return 3;
    }

    private int computeTacticalComplementarity(CustomPlayerEntity a, CustomPlayerEntity b, String style) {
        int baseSynergy = computePartnerSynergy(a, b);
        // Premiar equilibrio Recuperador (alta Defensa) + Organizador (alto Pase + Visión)
        boolean aIsDestroyer = a.defending() >= 84;
        boolean bIsCreator = (b.passing() + b.vision()) / 2 >= 87;
        boolean bIsDestroyer = b.defending() >= 84;
        boolean aIsCreator = (a.passing() + a.vision()) / 2 >= 87;
        if ((aIsDestroyer && bIsCreator) || (bIsDestroyer && aIsCreator)) {
            baseSynergy += 9;
        }
        // Premiar Asistidor desequilibrante (Ritmo + Regate) + Rematador o Pívot (Tiro)
        boolean aIsWinger = (a.pace() + a.dribbling()) / 2 >= 89;
        boolean bIsFinisher = b.shooting() >= 88;
        if ((aIsWinger && bIsFinisher) || (b.pace() >= 89 && a.shooting() >= 88)) {
            baseSynergy += 8;
        }
        // Premiar perfiles de pie complementarios (Zurdo + Diestro)
        if (!a.preferredFoot().equalsIgnoreCase(b.preferredFoot())) {
            baseSynergy += 5;
        }
        return baseSynergy;
    }

    private List<String> buildIdealKeyPartnerships(List<CustomPlayerEntity> starters, String playStyle) {
        if (starters.size() < 2) {
            return List.of();
        }
        record PairScore(String label, int score) {}
        List<PairScore> pairs = new ArrayList<>();
        String styleLower = playStyle != null ? playStyle.toLowerCase() : "posesión";

        for (int i = 0; i < starters.size(); i++) {
            for (int j = i + 1; j < starters.size(); j++) {
                CustomPlayerEntity a = starters.get(i);
                CustomPlayerEntity b = starters.get(j);
                if ("POR".equalsIgnoreCase(a.position()) && !"DFC".equalsIgnoreCase(b.position()) && !"CIE".equalsIgnoreCase(b.position())) {
                    continue;
                }
                int score = computeTacticalComplementarity(a, b, styleLower);
                String roleReason;
                if (a.defending() >= 85 && (b.passing() + b.vision()) / 2 >= 88) {
                    roleReason = "Equilibrio Recuperación + Creación";
                } else if (b.defending() >= 85 && (a.passing() + a.vision()) / 2 >= 88) {
                    roleReason = "Soporte Defensivo + Lanzador";
                } else if ((a.pace() + a.dribbling()) / 2 >= 89 && b.shooting() >= 86) {
                    roleReason = "Desborde por Banda + Definición";
                } else if ((a.passing() + a.vision()) / 2 >= 90 && b.shooting() >= 86) {
                    roleReason = "Pase Filtrado + Desmarque de Gol";
                } else {
                    roleReason = "Salida Limpia & Cobertura";
                }
                String label = String.format(
                        "%s (#%d %s) ⇄ %s (#%d %s) · %s",
                        a.name(), a.jerseyNumber(), a.position(),
                        b.name(), b.jerseyNumber(), b.position(),
                        roleReason
                );
                pairs.add(new PairScore(label, score));
            }
        }

        return pairs.stream()
                .sorted(Comparator.comparingInt(PairScore::score).reversed())
                .limit(3)
                .map(PairScore::label)
                .toList();
    }

    private String buildIdealLineupExplanation(
            String modality,
            String formation,
            String playStyle,
            List<CustomPlayerEntity> starters,
            List<Map<String, Object>> substitutes,
            List<String> partnerships,
            List<String> rotations
    ) {
        if (starters.isEmpty()) {
            return "Registra jugadores compatibles con " + modality + " o carga la Plantilla Demo para calcular la combinación ideal.";
        }
        String style = playStyle != null ? playStyle.toLowerCase() : "posesión";

        CustomPlayerEntity bestPasser = starters.stream()
                .max(Comparator.comparingInt(p -> p.passing() + p.vision()))
                .orElse(starters.get(0));
        CustomPlayerEntity bestDefender = starters.stream()
                .filter(p -> !"POR".equalsIgnoreCase(p.position()))
                .max(Comparator.comparingInt(CustomPlayerEntity::defending))
                .orElse(starters.get(0));
        CustomPlayerEntity fastestAttacker = starters.stream()
                .filter(p -> !"POR".equalsIgnoreCase(p.position()))
                .max(Comparator.comparingInt(p -> p.pace() + p.shooting()))
                .orElse(starters.get(0));
        CustomPlayerEntity bestDribbler = starters.stream()
                .filter(p -> !"POR".equalsIgnoreCase(p.position()))
                .max(Comparator.comparingInt(p -> p.dribbling() + p.vision()))
                .orElse(starters.get(0));

        StringBuilder sb = new StringBuilder();
        if (style.contains("posesión") || style.contains("posesion")) {
            sb.append(String.format(
                    "🎯 Posesión & Juego de Posición (%s): Se priorizó Pase + Visión + Regate en todas las líneas. Entran como titulares clave %s (#%d, PAS %d / VIS %d) y %s (#%d, REG %d) para garantizar salida limpia desde el fondo y circulación asociativa sin rifar el balón.",
                    formation, bestPasser.name(), bestPasser.jerseyNumber(), bestPasser.passing(), bestPasser.vision(),
                    bestDribbler.name(), bestDribbler.jerseyNumber(), bestDribbler.dribbling()
            ));
        } else if (style.contains("presión") || style.contains("presion") || style.contains("gegenpressing")) {
            sb.append(String.format(
                    "🔥 Presión Alta / Gegenpressing (%s): Se priorizó Ritmo + Defensa para sostener el achique tras pérdida en campo rival. Entran como titulares %s (#%d, RIT %d) y %s (#%d, DEF %d) liderando la primera línea de presión intensa.",
                    formation, fastestAttacker.name(), fastestAttacker.jerseyNumber(), fastestAttacker.pace(),
                    bestDefender.name(), bestDefender.jerseyNumber(), bestDefender.defending()
            ));
        } else if (style.contains("bloque") || style.contains("bajo") || style.contains("contra")) {
            sb.append(String.format(
                    "🛡️ Bloque Bajo & Contragolpe (%s): Se blindó el bloque posterior con máxima Defensa incluyendo a %s (#%d, DEF %d) y se apostó arriba por la velocidad y remate de %s (#%d, RIT %d / TIR %d) para liquidar al contragolpe.",
                    formation, bestDefender.name(), bestDefender.jerseyNumber(), bestDefender.defending(),
                    fastestAttacker.name(), fastestAttacker.jerseyNumber(), fastestAttacker.pace(), fastestAttacker.shooting()
            ));
        } else if (style.contains("directo") || style.contains("vertical")) {
            sb.append(String.format(
                    "⚡ Juego Directo & Vertical (%s): Entran al XI %s (#%d, PAS %d / VIS %d) como lanzador en largo y %s (#%d, TIR %d / RIT %d) como referente de ruptura para ganar segundas jugadas y atacar en dos toques.",
                    formation, bestPasser.name(), bestPasser.jerseyNumber(), bestPasser.passing(), bestPasser.vision(),
                    fastestAttacker.name(), fastestAttacker.jerseyNumber(), fastestAttacker.shooting(), fastestAttacker.pace()
            ));
        } else {
            sb.append(String.format(
                    "🔄 Rotación Dinámica (%s): Entran como titulares los perfiles más polivalentes en Regate + Visión + Ritmo como %s (#%d, REG %d / VIS %d) y %s (#%d, RIT %d) para permutar carriles y alturas sin perder equilibrio.",
                    formation, bestDribbler.name(), bestDribbler.jerseyNumber(), bestDribbler.dribbling(), bestDribbler.vision(),
                    fastestAttacker.name(), fastestAttacker.jerseyNumber(), fastestAttacker.pace()
            ));
        }

        if (!rotations.isEmpty()) {
            sb.append(" 🔄 Decisión táctica titular/banca: ").append(rotations.get(0));
        }

        if (substitutes != null && !substitutes.isEmpty()) {
            String revulsivos = substitutes.stream()
                    .limit(3)
                    .map(sub -> String.format("%s (#%s %s)", sub.get("name"), sub.get("jerseyNumber"), sub.get("naturalPosition")))
                    .collect(Collectors.joining(", "));
            sb.append(" 🪑 Revulsivos clave en la banca para el 2.º tiempo: ").append(revulsivos).append(".");
        }
        return sb.toString();
    }

    private boolean isPlayerCompatibleWithModality(String position, boolean isFutsalModality) {
        String pos = position != null ? position.toUpperCase().trim() : "";
        if ("POR".equals(pos)) {
            return true;
        }
        Set<String> futsalOnly = Set.of("CIE", "ALA", "PIV", "PJ", "UNI");
        if (isFutsalModality) {
            return futsalOnly.contains(pos);
        }
        return !futsalOnly.contains(pos);
    }

    private boolean isStrictNaturalMatch(String playerPos, String slotRole) {
        String p = playerPos != null ? playerPos.toUpperCase().trim() : "";
        String s = slotRole != null ? slotRole.toUpperCase().trim() : "";

        // Portero nunca juega en campo y jugador de campo nunca va al arco automáticamente
        if (s.equals("POR") || s.equals("PJ")) {
            return p.equals("POR");
        }
        if (p.equals("POR")) {
            return false;
        }

        // Futsal strict matches
        if (p.equals("CIE")) {
            return s.startsWith("CIE") || s.startsWith("UNI") || s.startsWith("INT");
        }
        if (p.equals("ALA")) {
            return s.startsWith("ALA") || s.startsWith("INT") || s.startsWith("ENG") || s.startsWith("UNI") || s.startsWith("CIE-") || s.startsWith("PIV-");
        }
        if (p.equals("PIV")) {
            return s.startsWith("PIV") || s.startsWith("UNI") || s.equals("ENG");
        }

        // Fútbol 7 / 9 / 11 strict matches
        if (p.equals("DFC")) {
            return s.startsWith("DFC") || s.startsWith("DF-") || s.equals("LIB");
        }
        if (p.equals("LD")) {
            return s.equals("LD") || s.equals("LAT-D") || s.equals("CAR-D") || s.equals("DF-D") || s.equals("MD");
        }
        if (p.equals("LI")) {
            return s.equals("LI") || s.equals("LAT-I") || s.equals("CAR-I") || s.equals("DF-I") || s.equals("MI");
        }
        if (p.equals("MCD")) {
            return s.startsWith("MCD") || s.equals("PIV") || s.startsWith("MC") || s.startsWith("INT");
        }
        if (p.equals("MC")) {
            return s.startsWith("MC") || s.startsWith("INT") || s.equals("PIV");
        }
        if (p.equals("MCO")) {
            return s.startsWith("MCO") || s.equals("ENG") || s.startsWith("INT") || s.startsWith("MC") || s.equals("SD") || s.equals("F9");
        }
        if (p.equals("ED")) {
            return s.equals("ED") || s.equals("EXT-D") || s.equals("MD") || s.equals("CAR-D") || s.equals("DC-D") || s.equals("SD");
        }
        if (p.equals("EI")) {
            return s.equals("EI") || s.equals("EXT-I") || s.equals("MI") || s.equals("CAR-I") || s.equals("DC-I") || s.equals("SD");
        }
        if (p.equals("DC")) {
            return s.startsWith("DC") || s.equals("SD") || s.equals("F9");
        }
        return p.equals(s);
    }

    private Map<String, Object> buildPlayerComparison(
            CustomPlayerEntity player,
            List<CustomPlayerEntity> squad,
            List<TopReferencePlayer> top100,
            String modality
    ) {
        boolean isFutsalModality = "Futsal".equalsIgnoreCase(modality)
                || Set.of("CIE", "ALA", "PIV", "PJ").contains(player.position().toUpperCase());

        TopReferencePlayer bestMatch = null;
        double bestSimilarity = -1.0;

        for (TopReferencePlayer ref : top100) {
            boolean refIsFutsal = "Futsal".equalsIgnoreCase(ref.sport());
            double sportBonus = (isFutsalModality == refIsFutsal) ? 10.0 : 0.0;
            double posBonus = arePositionsCompatible(player.position(), ref.position()) ? 16.0 : 0.0;

            // Distancia de perfil de atributos normalizada (forma del perfil)
            double statDiff = (Math.abs(player.pace() - ref.pace())
                    + Math.abs(player.passing() - ref.passing())
                    + Math.abs(player.dribbling() - ref.dribbling())
                    + Math.abs(player.defending() - ref.defending())
                    + Math.abs(player.shooting() - ref.shooting())
                    + Math.abs(player.vision() - ref.vision())) / 6.0;

            double score = (100.0 - statDiff) + sportBonus + posBonus;
            if (score > bestSimilarity) {
                bestSimilarity = score;
                bestMatch = ref;
            }
        }

        if (bestMatch == null && !top100.isEmpty()) {
            bestMatch = top100.get(0);
        }

        int matchPercentage = (int) Math.min(98, Math.max(72, Math.round(bestSimilarity - 14)));

        // Identificar fortaleza principal y área a potenciar
        String topStrength = detectTopAttributeLabel(player);
        String areaToImprove = detectAreaToImprove(player);

        // Encontrar los 2 mejores socios dentro de la misma plantilla
        List<String> bestPartners = squad.stream()
                .filter(other -> !other.id().equals(player.id()))
                .sorted(Comparator.comparingInt((CustomPlayerEntity other) -> computePartnerSynergy(player, other)).reversed())
                .limit(2)
                .map(other -> other.name() + " (#" + other.jerseyNumber() + " · " + other.position() + ")")
                .toList();

        String mirrorSportBadge = "Futsal".equalsIgnoreCase(bestMatch != null ? bestMatch.sport() : "")
                ? "Espejo Top 25 Futsal"
                : ("Fútbol 7".equalsIgnoreCase(modality) || "Fútbol 9".equalsIgnoreCase(modality)
                        ? "Espejo Top 75 Fútbol 11 adaptado a " + modality
                        : "Espejo Top 75 Fútbol 11");

        Map<String, Object> card = new LinkedHashMap<>();
        card.put("playerId", player.id());
        card.put("playerName", player.name());
        card.put("jerseyNumber", player.jerseyNumber());
        card.put("position", player.position());
        card.put("preferredFoot", player.preferredFoot());
        card.put("overall", player.overallRating());
        if (bestMatch != null) {
            card.put("similarCrackName", bestMatch.name());
            card.put("similarCrackSport", bestMatch.sport());
            card.put("similarCrackEra", bestMatch.era());
            card.put("similarCrackPosition", bestMatch.position());
            card.put("similarCrackStyle", bestMatch.playStyle());
            card.put("similarCrackWiki", bestMatch.wikiExtract());
            card.put("mirrorBadge", mirrorSportBadge);
            card.put("similarityPct", matchPercentage);
            card.put("whySimilar", String.format(
                    "Por su perfil en %s y su combinación de atributos (Pase %d, Regate %d, Visión %d), %s comparte el ADN de cancha de %s (%s).",
                    topStrength, player.passing(), player.dribbling(), player.vision(),
                    player.name(), bestMatch.name(), bestMatch.playStyle()
            ));
        }
        card.put("whatToPotentiate", areaToImprove);
        card.put("bestPartners", bestPartners);
        return card;
    }

    public String buildSquadContextForChatbot(String modality) {
        return buildSquadContextForChatbot(modality, "demo-club");
    }

    public String buildSquadContextForChatbot(String modality, String tenantId) {
        List<CustomPlayerEntity> players = getAllCustomPlayers(tenantId);
        if (players.isEmpty()) {
            return "";
        }
        List<TopReferencePlayer> top100 = getAllTopReferencePlayers();
        StringBuilder sb = new StringBuilder();
        sb.append("PLANTILLA PROPIA DEL ENTRENADOR REGISTRADA EN POSTGRESQL (").append(players.size()).append(" jugadores):\n");
        for (CustomPlayerEntity p : players) {
            Map<String, Object> comp = buildPlayerComparison(p, players, top100, modality);
            sb.append(String.format(
                    "- #%d %s (Posición: %s, Pie: %s, Media: %d | Ritmo:%d Pase:%d Regate:%d Defensa:%d Tiro:%d Visión:%d) -> Similar a: %s (%s). Mejores socios: %s.\n",
                    p.jerseyNumber(),
                    p.name(),
                    p.position(),
                    p.preferredFoot(),
                    p.overallRating(),
                    p.pace(), p.passing(), p.dribbling(), p.defending(), p.shooting(), p.vision(),
                    comp.getOrDefault("similarCrackName", "Referente"),
                    comp.getOrDefault("similarCrackStyle", ""),
                    comp.getOrDefault("bestPartners", List.of())
            ));
        }
        return sb.toString();
    }

    private int computePositionFitScore(CustomPlayerEntity p, String slotRole) {
        String pos = p.position().toUpperCase();
        String slot = slotRole.toUpperCase();

        if (slot.contains("POR") || slot.contains("PJ")) {
            return pos.contains("POR") ? 96 : 45;
        }
        if (pos.contains("POR")) {
            return 40;
        }

        if (arePositionsCompatible(pos, slot)) {
            return Math.min(98, 84 + (p.overallRating() - 70) / 2);
        }

        // Compatibilidad por línea táctica (Defensa / Medio / Ataque)
        if (isDefensiveRole(slot)) {
            return Math.min(92, (p.defending() * 2 + p.passing() + p.pace()) / 4);
        }
        if (isMidfieldRole(slot)) {
            return Math.min(92, (p.passing() * 2 + p.vision() + p.dribbling()) / 4);
        }
        return Math.min(92, (p.shooting() * 2 + p.pace() + p.dribbling()) / 4);
    }

    private boolean arePositionsCompatible(String posA, String posB) {
        String a = posA.toUpperCase();
        String b = posB.toUpperCase();
        if (a.equals(b) || b.startsWith(a) || a.startsWith(b)) {
            return true;
        }
        if ((a.equals("CIE") || a.equals("DFC") || a.equals("LIB")) && (b.contains("DF") || b.contains("CIE") || b.contains("LIB"))) {
            return true;
        }
        if ((a.equals("LD") || a.equals("LI") || a.equals("ALA")) && (b.contains("LAT") || b.contains("CAR") || b.contains("LI") || b.contains("LD") || b.contains("ALA"))) {
            return true;
        }
        if ((a.equals("MCD") || a.equals("MC") || a.equals("MCO")) && (b.contains("MC") || b.contains("PIV") || b.contains("INT") || b.contains("ENG") || b.contains("UNI"))) {
            return true;
        }
        return (a.equals("ED") || a.equals("EI") || a.equals("DC") || a.equals("PIV") || a.equals("ALA"))
                && (b.contains("DC") || b.contains("EI") || b.contains("ED") || b.contains("EXT") || b.contains("PIV") || b.contains("SD") || b.contains("F9"));
    }

    private boolean isDefensiveRole(String role) {
        return role.contains("DF") || role.contains("CIE") || role.contains("LIB") || role.contains("LI") || role.contains("LD") || role.contains("LAT");
    }

    private boolean isMidfieldRole(String role) {
        return role.contains("MC") || role.contains("PIV") || role.contains("INT") || role.contains("CAR") || role.contains("ENG") || role.contains("UNI") || role.contains("MI") || role.contains("MD");
    }

    private int computePartnerSynergy(CustomPlayerEntity a, CustomPlayerEntity b) {
        if (a.position().equalsIgnoreCase(b.position())) {
            return (a.passing() + b.passing()) / 2;
        }
        // Complementariedad: pasador + definidor, o recuperador + creativo
        int passerToFinisher = (a.passing() + a.vision() + b.shooting() + b.pace()) / 4;
        int defenderToCreator = (a.defending() + b.dribbling() + b.vision()) / 3;
        return Math.max(passerToFinisher, defenderToCreator);
    }

    private String detectTopAttributeLabel(CustomPlayerEntity p) {
        Map<String, Integer> map = Map.of(
                "Velocidad y Desborde", p.pace(),
                "Pase y Distribución", p.passing(),
                "Regate en 1v1", p.dribbling(),
                "Solidez Defensiva", p.defending(),
                "Definición y Remate", p.shooting(),
                "Visión de Juego", p.vision()
        );
        return map.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("Juego Asociativo");
    }

    private String detectAreaToImprove(CustomPlayerEntity p) {
        if (p.position().equalsIgnoreCase("POR")) {
            return "Potenciar el primer pase tenso con los pies para romper líneas de presión.";
        }
        if (p.defending() < 70 && isMidfieldRole(p.position())) {
            return "Trabajar el repliegue tras pérdida y perfilación defensiva (" + p.defending() + " DEF).";
        }
        if (p.shooting() < 78 && !isDefensiveRole(p.position())) {
            return "Aumentar la eficacia de remate al primer toque llegando al área (" + p.shooting() + " TIR).";
        }
        if (p.passing() < 80) {
            return "Pulir los controles orientados y pases filtrados bajo presión (" + p.passing() + " PAS).";
        }
        return "Mantener su pico de rendimiento en " + detectTopAttributeLabel(p) + " y liderar las transiciones de su línea.";
    }

    private List<String> defaultSlotsForModality(String modality, int count) {
        if (count == 5) {
            return List.of("POR", "CIE", "ALA-I", "ALA-D", "PIV");
        }
        if (count == 7) {
            return List.of("POR", "DFC-I", "DFC-D", "MCD", "CAR-I", "CAR-D", "DC");
        }
        if (count == 9) {
            return List.of("POR", "DF-I", "DF-C", "DF-D", "PIV", "INT-I", "INT-D", "DC-I", "DC-D");
        }
        return List.of("POR", "LI", "DFC", "DFC", "LD", "PIV", "INT", "INT", "EI", "DC", "ED");
    }

    private int clampStat(int val) {
        return Math.max(1, Math.min(99, val));
    }
}
