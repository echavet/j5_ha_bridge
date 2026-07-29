# J5 Hassio Bridge pour Home Assistant

## Introduction

**J5 Hassio Bridge** est un add-on Home Assistant qui relie une carte **Arduino** (firmware **ConfigurableFirmata**) à Home Assistant via **MQTT** et la bibliothèque **Johnny-Five**.

Il permet notamment de :

- lire des **capteurs analogiques** (pression, pH, redox/ORP, etc.) avec calibration optionnelle ;
- piloter des **relais** ;
- lire des **capteurs binaires** (débit, contact, etc.) ;
- découvrir des **thermomètres** (dont DS18B20 en bus 1-Wire).

L’add-on publie les entités par **MQTT Discovery** : elles apparaissent automatiquement dans Home Assistant (si le broker MQTT et l’intégration MQTT sont opérationnels).

---

## Pré-requis

- Home Assistant avec le **Supervisor** (OS / Supervised) pour installer des add-ons.
- L’add-on / intégration **MQTT** (Mosquitto ou équivalent) déjà configuré : l’add-on J5 **nécessite** le service MQTT (`mqtt:need`).
- Une carte Arduino flashée avec **[ConfigurableFirmata](https://github.com/firmata/ConfigurableFirmata)**  
  - Préférez une version récente (branche principale) : d’anciennes builds contiennent des bugs gênants.  
  - Le **baudrate** du firmware doit correspondre à celui configuré dans l’add-on (souvent **115200**).
- Les capteurs / relais câblés sur la carte.
- Le périphérique série de l’Arduino visible par Home Assistant (USB).  
  **Recommandé** : chemin stable `/dev/serial/by-id/...` plutôt que `/dev/ttyACM0` (qui peut changer au redémarrage).

---

## Installation

1. Home Assistant → **Paramètres** → **Modules complémentaires**.
2. **Boutique des modules complémentaires**.
3. Menu **⋯** (en haut à droite) → **Dépôts**.
4. Ajouter : `https://github.com/echavet/j5_ha_bridge`
5. Dans la boutique, section du dépôt *Johnny-Five Home Assistant addon repository*, installer **J5 Hassio Bridge**.
6. Configurer l’add-on (voir ci-dessous), démarrer, activer éventuellement le démarrage automatique et le **chien de garde** (recommandé si la carte peut redémarrer).

---

## Configuration — vue d’ensemble

La configuration se fait dans l’UI de l’add-on (YAML). Structure typique :

```yaml
device: /dev/serial/by-id/usb-Arduino__www.arduino.cc__0043_xxxxxxxxxxxx-if00
baudrate: "115200"          # ou 115200 selon l’UI
discovery_topic: homeassistant

calibration_sets: []        # points de calibration (optionnel)
binary_sensors: []          # entrées digitales
relays: []                  # sorties relais
sensors: []                 # analogiques
thermometers: []            # température
```

Les listes vides (`[]`) signifient « aucun élément de ce type ». Ce n’est **pas** une erreur.

> **Important — profondeur YAML Home Assistant**  
> Les options d’add-on ne supportent que **2 niveaux** d’imbrication pour tableaux/dictionnaires. C’est pour cela que la calibration n’est **pas** un objet imbriqué sous chaque capteur, mais une liste plate `calibration_sets` référencée par un nom (`set`).

---

# Référence complète des paramètres

Pour chaque paramètre : **rôle**, **type**, **obligatoire ou non**, **valeur par défaut**, **pièges d’interprétation**, **exemple**.

---

## 1. Paramètres globaux (racine de la config)

### `device`

| | |
|--|--|
| **Rôle** | Chemin du port série de l’Arduino tel que vu **dans le conteneur** de l’add-on. |
| **Type** | Périphérique `tty` (sélecteur UI) ou chaîne de chemin. |
| **Obligatoire** | **Oui** (sans cela, pas de connexion). |
| **Défaut** | `null` (non configuré). |

**Ce que ce n’est pas :**

- Ce n’est **pas** l’adresse IP de Home Assistant.
- Ce n’est **pas** le topic MQTT.
- Ce n’est **pas** « n’importe quel USB » : il faut le **bon** port Arduino.

**Bonnes pratiques :**

- Préférer `/dev/serial/by-id/usb-...` : stable après reboot.
- Éviter `/dev/ttyACM0` seul si vous avez plusieurs USB série (le numéro peut permuter).

**Exemple :**

```yaml
device: /dev/serial/by-id/usb-Arduino__www.arduino.cc__0043_24236323730351306161-if00
```

Au démarrage, les logs affichent l’identité du port (et tentent d’identifier le type de carte USB, ex. Uno R3 via le productId dans le chemin `by-id`).

---

### `baudrate`

| | |
|--|--|
| **Rôle** | Vitesse de communication série avec ConfigurableFirmata. |
| **Type** | Une des valeurs : `9600`, `19200`, `38400`, `57600`, `115200`. |
| **Obligatoire** | Non (mais fortement recommandé de l’expliciter). |
| **Défaut** | `115200` (valeur par défaut des options de l’add-on). |

**Piège :** si le baudrate de l’add-on **≠** celui du firmware flashé, la connexion échoue ou se comporte de façon aléatoire. Les deux doivent être **identiques**.

**Exemple :**

```yaml
baudrate: "115200"
```

---

### `discovery_topic`

| | |
|--|--|
| **Rôle** | Préfixe du topic MQTT utilisé pour la **découverte automatique** Home Assistant (MQTT Discovery). |
| **Type** | Chaîne. |
| **Obligatoire** | Non. |
| **Défaut** | `"homeassistant"`. |

**Piège courant :**

- Ce n’est **pas** le topic d’état des capteurs (`j5_ha_bridge/sensor/...`).
- C’est uniquement le préfixe des messages **config** du type :  
  `homeassistant/sensor/<unique_id>/config`
- Si votre intégration MQTT HA utilise un autre préfixe de discovery, alignez cette valeur (cas rare).

**Exemple :**

```yaml
discovery_topic: homeassistant
```

---

## 2. `calibration_sets` — points de calibration

Liste **plate** de points. Plusieurs lignes peuvent partager le même nom de jeu (`set`). Un capteur référence ce nom via `calibration_set`.

### Anatomie d’un point

```yaml
calibration_sets:
  - set: mon_jeu
    x_point: 302      # entrée = valeur ADC brute (0…1023 sur Uno 10 bits typique)
    y_point: 650      # sortie = grandeur physique voulue (mV, pH, bar, …)
```

### `set`

| | |
|--|--|
| **Rôle** | Nom du **jeu** de calibration. Sert de clé partagée entre plusieurs points et le capteur. |
| **Type** | Chaîne. |
| **Obligatoire** | Oui pour chaque entrée de la liste. |
| **Défaut** | Aucun. |

**Piège :** le nom doit être **exactement** le même que `sensors[].calibration_set` (casse et orthographe).  
`redox` ≠ `Redox` ≠ `redox `.

---

### `x_point`

| | |
|--|--|
| **Rôle** | Coordonnée **X** de la courbe = valeur **brute ADC** mesurée (pas la tension en volts, pas la valeur déjà convertie). |
| **Type** | Nombre (float accepté). |
| **Obligatoire** | Oui pour un point utile. |
| **Défaut** | Aucun. |

**Comment l’obtenir :**

1. Placer la sonde dans une solution / situation connue (ou lire l’attribut / entité **raw**).
2. Noter la valeur **ADC** affichée (ex. `302`), **pas** le mV déjà calibré.
3. Utiliser cette valeur comme `x_point`.

Sur Arduino **Uno** (10 bits, Vref ≈ 5 V) : ADC entre **0 et 1023**.  
Sur certaines cartes **12 bits**, la plage peut aller jusqu’à **4095** — la calibration doit utiliser les bruts **de votre** carte.

---

### `y_point`

| | |
|--|--|
| **Rôle** | Coordonnée **Y** = grandeur **physique** que vous voulez voir dans Home Assistant pour ce point. |
| **Type** | Nombre. |
| **Obligatoire** | Oui pour un point utile. |
| **Défaut** | Aucun. |

**Exemples de sens de `y_point` :**

| Capteur | Exemple `y_point` | Unité typique du sensor |
|---------|-------------------|---------------------------|
| Redox / ORP | `650` | `mv` |
| pH | `7.0` | `ph` ou sans unité |
| Pression | `1.0` | `bar` |

**Piège :** `y_point` n’est **pas** un second point ADC. C’est la **vérité terrain** (solution tampon, manomètre, notice constructeur, etc.).

---

### Combien de points ? Quel type de courbe ?

Cela dépend de `calibration_type` du **capteur** (voir plus bas) :

| `calibration_type` | Points minimum conseillés | Remarque |
|--------------------|---------------------------|----------|
| `linear` | **2** | Droite ; 1 seul point est **insuffisant** (il faudrait inventer la pente). |
| `dfrobot_orp` | **1** suffit | Formule native DFRobot SEN0165 / Gravity ORP ; seul l’**OFFSET** est calé sur le(s) point(s). |
| `polynomial` | Au moins `calibration_order + 1` | Ex. ordre 3 → idéalement ≥ 4 points (3 peuvent « coller » mais moins robustes). |
| `exponential`, `logarithmic`, `power` | Selon la lib de régression ; en pratique ≥ 2–3 points bien répartis | |

**Exemple — redox DFRobot (recommandé pour carte Gravity ORP / SEN0165) :**

Un seul point terrain (ADC mesuré dans une solution connue, ici 650 mV) :

```yaml
calibration_sets:
  - set: redox
    x_point: 302    # ADC lu en solution 650 mV (votre mesure)
    y_point: 650    # valeur vraie de la solution (mV)
```

```yaml
sensors:
  - name: Sonde Redox
    pin: A4
    unit: mv
    calibration_set: redox
    calibration_type: dfrobot_orp
```

**Exemple — même résultat en `linear` (ancienne méthode, 2 points) :**

```yaml
calibration_sets:
  # raw 0 → ORP théorique avec offset calé sur solution 650 mV @ raw 302
  - set: redox
    x_point: 0
    y_point: 2124.61
  - set: redox
    x_point: 302
    y_point: 650
```

**Exemple — pH polynomial (3 tampons) :**

```yaml
calibration_sets:
  - set: PH
    x_point: 328
    y_point: 4
  - set: PH
    x_point: 498
    y_point: 7.4
  - set: PH
    x_point: 658
    y_point: 10.01
```

**Liste vide par défaut :**

```yaml
calibration_sets: []
```

Signifie : aucune courbe définie. Les capteurs sans `calibration_set` publient alors la valeur **ADC brute** (ou la valeur Johnny-Five) comme état — pas une grandeur physique convertie.

---

## 3. `binary_sensors` — entrées digitales (contact, débit, etc.)

Dans le code, ces éléments sont branchés sur la classe **Switch** de Johnny-Five, mais côté Home Assistant ce sont des **`binary_sensor`** (lecture seule : pas de commande).

### `name`

| | |
|--|--|
| **Rôle** | Nom affiché dans Home Assistant. |
| **Type** | Chaîne. |
| **Obligatoire** | Oui. |
| **Défaut** | Aucun. |

Influence aussi l’identifiant MQTT (après normalisation : accents retirés, espaces → `_`).

---

### `pin`

| | |
|--|--|
| **Rôle** | Broche **digitale** Arduino (numéro de pin Firmata / Johnny-Five). |
| **Type** | Chaîne recommandée (`"11"`) pour éviter les ambiguïtés YAML. |
| **Obligatoire** | Oui. |
| **Défaut** | Aucun. |

**Piège :** ce n’est **pas** une broche analogique `A0`. Pour un contact sec / débitmètre digital, utiliser D2, D11, etc.

---

### `type`

| | |
|--|--|
| **Rôle** | Nature électrique du contact côté Johnny-Five : **NO** (Normally Open) ou **NC** (Normally Closed). |
| **Type** | `NO` ou `NC`. |
| **Obligatoire** | Non. |
| **Défaut** | Comportement Johnny-Five par défaut si omis (en pratique, précisez toujours). |

**Interprétation (ne pas confondre avec un relais de sortie) :**

- **NO** : au repos le circuit est ouvert ; l’activation **ferme** le contact.
- **NC** : au repos le circuit est fermé ; l’activation **ouvre** le contact.

Cela doit correspondre au **câblage réel** du détecteur, pas à ce que vous « souhaitez » voir dans HA. Pour inverser la logique affichée, utilisez plutôt `invert`.

---

### `invert`

| | |
|--|--|
| **Rôle** | Inverse la logique lue avant publication (utile si ON/OFF sont à l’envers dans HA). |
| **Type** | Booléen. |
| **Obligatoire** | Non. |
| **Défaut** | `false` (pas d’inversion) si omis. |

**Piège :** `invert: true` ne change **pas** le câblage ; il change seulement l’interprétation logicielle.

---

### `device_class`

| | |
|--|--|
| **Rôle** | Classe Home Assistant du binary_sensor (icône, sémantique UI). |
| **Type** | Une des classes HA supportées par le schéma (ex. `running`, `door`, `motion`, `opening`, …). |
| **Obligatoire** | Non. |
| **Défaut** | Aucune classe particulière (comportement générique HA). |

**Exemple — détecteur de débit (actif = filtration en cours) :**

```yaml
binary_sensors:
  - name: Détecteur de débit
    pin: "11"
    type: NC
    invert: true
    device_class: running
```

---

## 4. `relays` — sorties (pompe, lumière, etc.)

Exposés dans HA comme des **interrupteurs** commandables (MQTT `switch` par défaut).

### `name`

| | |
|--|--|
| **Rôle** | Nom de l’entité. |
| **Type** | Chaîne (optionnelle dans le schéma, mais **fortement recommandée**). |
| **Obligatoire** | Recommandé oui. |
| **Défaut** | Si absent, l’identifiant MQTT peut être peu lisible. |

---

### `pin`

| | |
|--|--|
| **Rôle** | Broche digitale qui pilote le module relais. |
| **Type** | Chaîne / numéro de pin. |
| **Obligatoire** | Oui. |
| **Défaut** | Aucun. |

---

### `type`

| | |
|--|--|
| **Rôle** | Type de **relais** Johnny-Five : `NO` ou `NC`. |
| **Type** | `NO` \| `NC` (**obligatoire** dans le schéma). |
| **Obligatoire** | Oui. |
| **Défaut** | Aucun (il faut le renseigner). |

**Sens :**

- **NO (Normally Open)** : au repos, le circuit de charge est **ouvert** (équipement off si câblé de façon standard). Commande ON → ferme le contact.
- **NC (Normally Closed)** : au repos, le circuit est **fermé**. La logique ON/OFF côté logiciel est adaptée en conséquence.

**Piège :** ne confondez pas `type` du relais avec `type` du binary_sensor : même noms NO/NC, mais **sortie** vs **entrée**.

---

### `device_class`

| | |
|--|--|
| **Rôle** | Classe / présentation côté HA (selon ce que l’announce MQTT envoie). |
| **Type** | Chaîne libre dans le schéma actuel. |
| **Obligatoire** | Non. |
| **Défaut** | Non forcé. |

**Exemple :**

```yaml
relays:
  - name: Filtration
    pin: "8"
    type: "NO"
    device_class: switch
  - name: Éclairage
    pin: "7"
    type: "NO"
```

**Commandes MQTT attendues :** messages `ON` / `OFF` sur le topic de commande du relais (géré automatiquement via Discovery).

---

## 5. `sensors` — capteurs analogiques

Cœur de l’add-on pour pH, redox, pression, etc.

### Chaîne de traitement (lire avant les options)

Comprendre cet ordre évite toute ambiguïté entre « raw », « calibré » et « état HA » :

```text
1) Lecture ADC (Firmata / Johnny-Five)
2) Médiane interne Johnny-Five sur l’intervalle `freq`
3) Émission d’un événement si le changement dépasse `threshold`
4) Optionnel : médiane glissante sur N lectures → filter_samples
5) Optionnel : courbe de calibration → grandeur physique ("calibrated")
6) Optionnel : gardes value_min / value_max / max_jump → état principal publié
7) Publication MQTT JSON + Discovery HA
```

| Notion | Signification |
|--------|----------------|
| **raw / ADC** | Entier de conversion analogique (ex. 0–1023). **Pas** encore en mV/pH/bar. |
| **calibrated** (attribut / entité diagnostic) | Après calibration (et après `filter_samples` si activé), **avant** les gardes min/max/saut. |
| **value** (état principal HA) | Valeur « métier » après gardes : peut **retenir** l’ancienne valeur si un saut est rejeté. |

---

### `name`

| | |
|--|--|
| **Rôle** | Nom de l’entité principale. |
| **Type** | Chaîne. |
| **Obligatoire** | Oui. |
| **Défaut** | Aucun. |

Sert aussi à construire le `unique_id` MQTT (avec le numéro de pin).

---

### `pin`

| | |
|--|--|
| **Rôle** | Entrée **analogique** (`A0` … `A5` sur Uno, etc.). |
| **Type** | Chaîne (`A4`) ou notation acceptée par Johnny-Five. |
| **Obligatoire** | Oui. |
| **Défaut** | Aucun. |

**Piège :** `A4` n’est pas la pin digitale `4`.

---

### `unit`

| | |
|--|--|
| **Rôle** | Unité affichée dans HA (`unit_of_measurement`). |
| **Type** | Chaîne libre (`mv`, `bar`, `ph`, `%`, …). |
| **Obligatoire** | Oui (schéma). |
| **Défaut** | Aucun. |

**Piège :** l’unité est **déclarative** pour l’UI. Elle ne convertit rien toute seule : la conversion vient de `calibration_sets` + `calibration_type`.  
Si vous mettez `unit: mv` sans calibration, l’état peut rester un **ADC** étiqueté à tort en mV.

---

### `device_class`

| | |
|--|--|
| **Rôle** | Classe de capteur Home Assistant (`pressure`, `voltage`, `humidity`, …). |
| **Type** | Liste définie dans le schéma de l’add-on. |
| **Obligatoire** | Non. |
| **Défaut** | Aucune. |

Choisir une classe **cohérente** avec la grandeur affichée (ex. pression → `pressure`). Pour un redox en mV, `voltage` est souvent acceptable ; il n’existe pas toujours de classe « ORP » dédiée.

---

### `state_class`

| | |
|--|--|
| **Rôle** | Classe d’état HA pour statistiques / historique long terme. |
| **Type** | `measurement`, `total`, ou `total_increasing`. |
| **Obligatoire** | Non. |
| **Défaut côté add-on** | Si omis, l’announce MQTT utilise **`measurement`** (adapté aux mesures continues type pH, mV, bar). |

**Piège :**

- `measurement` = grandeur qui monte **et** descend (pH, température, ORP, pression).
- `total` / `total_increasing` = compteurs (énergie, volume cumulé). **Ne pas** les utiliser pour un redox.

---

### `freq`

| | |
|--|--|
| **Rôle** | Période d’échantillonnage Johnny-Five en **millisecondes** : intervalle entre deux traitements (médiane d’intervalle + test de `threshold`). |
| **Type** | Entier (ms). |
| **Obligatoire** | Non. |
| **Défaut** | Si omis, Johnny-Five utilise sa valeur par défaut interne (**25 ms** — très rapide, souvent trop pour de la chimie piscine). |

**Interprétation correcte :**

- `freq: 1000` → environ **1 lecture traitée par seconde** (pas 1000 lectures/s).
- `freq: 10000` → toutes les **10 secondes**.

**Ce n’est pas :**

- une fréquence en Hz ;
- un délai MQTT indépendant de Johnny-Five.

Pour pH / redox, des valeurs de **2 000 à 15 000 ms** sont courantes. Plus `freq` est grand, plus chaque point intègre déjà une médiane interne sur une fenêtre longue.

---

### `threshold`

| | |
|--|--|
| **Rôle** | Seuil de **changement sur la valeur ADC (médiane d’intervalle)** en dessous duquel l’événement `change` n’est **pas** émis. |
| **Type** | Nombre. |
| **Obligatoire** | Non. |
| **Défaut Johnny-Five** | **`1`** (toute variation d’au moins 1 compte ADC peut publier). |

**Unité de `threshold` :** comptes **ADC bruts**, **pas** des mV ni des pH.

Exemple : `threshold: 5` ignore les micro-variations de moins de 5 LSB ADC.

**Piège :**

- Si la valeur **ne change plus** (palier constant, filtration arrêtée, signal figé), **aucune** nouvelle publication `change` : l’historique HA peut sembler « figé » alors que l’add-on tourne encore.
- Augmenter `threshold` réduit le trafic MQTT ; trop haut, vous ratez de vrais petits mouvements.

---

### `calibration_set`

| | |
|--|--|
| **Rôle** | Nom du jeu dans `calibration_sets` à appliquer à ce capteur. |
| **Type** | Chaîne. |
| **Obligatoire** | Non. |
| **Défaut** | Absent = **pas de conversion** ; l’état tend à suivre l’ADC (après filtres éventuels). |

**Piège :** ce champ ne contient **pas** les points. Il ne fait que **référencer** le nom `set: ...`.

```yaml
# Correct
calibration_sets:
  - set: redox
    x_point: 302
    y_point: 650
sensors:
  - name: Sonde Redox
    calibration_set: redox   # même nom
```

---

### `calibration_type`

| | |
|--|--|
| **Rôle** | Méthode pour passer de `x_point` (ADC) à `y_point` (physique). |
| **Type** | `linear` \| `polynomial` \| `exponential` \| `logarithmic` \| `power` \| **`dfrobot_orp`** |
| **Obligatoire** | Non. |
| **Défaut** | **`linear`** si `calibration_set` est défini et type omis. |

**Sans `calibration_set`, ce paramètre est ignoré.**

**Conseils :**

- **`dfrobot_orp`** : cartes **DFRobot / Gravity ORP (SEN0165)** sur Arduino **5 V / 10 bits** (Uno, etc.). **Un seul point** de calibration suffit.
- **linear** : 2 points, droites génériques (pression, etc.).
- **polynomial** : courbes (pH multi-points) ; régler aussi `calibration_order`.

#### Détail `dfrobot_orp` (formule native DFRobot)

Implémentation alignée sur le sample code DFRobot :

\[
V_{mV} = \mathrm{ADC} \times \frac{5000}{1024}
\]

\[
\mathrm{ORP}_{raw} = \frac{30 \times 5000 - 75 \times V_{mV}}{75} = 2000 - V_{mV}
\]

\[
\mathrm{ORP} = \mathrm{ORP}_{raw} - \mathrm{OFFSET}
\]

- **`OFFSET`** est calculé au démarrage à partir des points du `calibration_set` :  
  pour chaque point, \(\mathrm{OFFSET}_i = \mathrm{ORP}_{raw}(x\_point) - y\_point\), puis **moyenne** si plusieurs points.
- Avec un seul point `(302, 650)` : l’affichage vaut **exactement 650 mV** quand l’ADC vaut 302 ; la pente reste celle de DFRobot (pas une pente inventée).
- L’attribut MQTT **`dfrobot_offset`** publie l’OFFSET utilisé (ex. ≈ `-124.61`).
- **`calibration_order`** et **`calibration_precision`** sont **ignorés** pour ce type.
- Hypothèse **Uno / 5 V / dénominateur 1024** (sample DFRobot). Cartes 3,3 V / 12 bits : ce mode n’est pas adapté tel quel.

**Migration depuis l’ancienne calib linear à 2 points** (0 → 2124.61 et 302 → 650) : gardez **uniquement** le point réel `(302, 650)` et passez à `calibration_type: dfrobot_orp`. Résultat numérique équivalent, YAML plus simple.

---

### `calibration_order`

| | |
|--|--|
| **Rôle** | Degré du polynôme si `calibration_type: polynomial`. |
| **Type** | Entier. |
| **Obligatoire** | Non. |
| **Défaut** | **`3`**. |

**Piège :** un ordre **trop élevé** avec peu de points **sur-ajuste** (passe par les points mais oscille entre eux).  
Règle pratique : nombre de points ≥ order + 1, et order modeste (2 ou 3) pour du pH.

**Ignoré** pour `linear` et **`dfrobot_orp`**.

---

### `calibration_precision`

| | |
|--|--|
| **Rôle** | Précision numérique passée à la bibliothèque de régression (nombre de chiffres significatifs des coefficients). |
| **Type** | Entier. |
| **Obligatoire** | Non. |
| **Défaut** | **`8`**. |

**Ce n’est pas :**

- le nombre de décimales affichées dans le tableau de bord HA (réglez l’affichage côté HA) ;
- la résolution de l’ADC.

Augmenter (ex. `16`–`20`) peut aider sur des polynômes un peu instables numériquement.

**Ignoré** pour **`dfrobot_orp`**.

---

### `filter_samples`

| | |
|--|--|
| **Rôle** | Taille de la **fenêtre de médiane glissante** appliquée **après** Johnny-Five, sur les lectures successives qui passent le `change`. |
| **Type** | Entier. |
| **Obligatoire** | Non. |
| **Défaut** | **`1`** = **désactivé** (pas de fenêtre supplémentaire). |

- `filter_samples: 5` → médiane des **5 dernières** valeurs ADC (post-J5) avant calibration.
- Utile contre du **grain** ponctuel.
- **Peu efficace** contre un **palier faux stable pendant des minutes** (toutes les mesures de la fenêtre sont fausses).

**Ce n’est pas** un temps en secondes. Le temps couvert ≈ `filter_samples ×` (intervalle entre événements `change`), lui-même lié à `freq` et à l’activité du signal.

---

### `max_jump`

| | |
|--|--|
| **Rôle** | Saut maximum **autorisé** entre deux valeurs **déjà converties** (après calibration), dans l’**unité du capteur** (`unit`), pour mettre à jour l’**état principal**. |
| **Type** | Nombre. |
| **Obligatoire** | Non. |
| **Défaut** | **Désactivé** (`null`) si omis. |

**Exemple :** `max_jump: 80` avec `unit: mv` → un écart de plus de **80 mV** par rapport à la dernière valeur **acceptée** est d’abord considéré comme suspect.

**Unité de `max_jump` :** la même que `unit` / la sortie calibrée (**mV, bar, pH…**), **pas** des comptes ADC.

**Comportement avec `max_jump_streak` (important) :**

1. Tant que le saut est trop grand, l’état principal **conserve l’ancienne valeur** (`reject_reason` / attributs).
2. Si le **nouveau régime** se répète **N fois de suite** (`max_jump_streak`), le **nouveau palier est accepté** (évite de rester bloqué des heures sur l’ancienne valeur).

Sans streak, un décalage durable de 300 mV **verrouillerait** l’affichage sur l’ancien niveau.

---

### `max_jump_streak`

| | |
|--|--|
| **Rôle** | Nombre de rejets **consécutifs** pour cause de `max_jump` avant d’**accepter** la nouvelle valeur comme baseline. |
| **Type** | Entier > 0. |
| **Obligatoire** | Non. |
| **Défaut** | **`5`** (uniquement utilisé si `max_jump` est défini). |

**Exemple :** `freq` ~ 5 s, `max_jump_streak: 5` → un nouveau palier peut être adopté après ~ **25 s** de lectures « trop loin » (ordre de grandeur, selon les `change` réellement émis).

**Piège :** si `max_jump` n’est **pas** défini, `max_jump_streak` n’a **aucun effet**.

---

### `value_min` / `value_max`

| | |
|--|--|
| **Rôle** | Bornes **physiques** acceptées pour l’**état principal**, **après** calibration. Hors plage → rejet (on garde la dernière valeur acceptée si elle existe). |
| **Type** | Nombres. |
| **Obligatoire** | Non. |
| **Défaut** | Aucune borne (tout est accepté de ce point de vue). |

**Unité :** même que la grandeur calibrée (`unit`), **pas** l’ADC.

**Exemple redox piscine :**

```yaml
value_min: 250
value_max: 950
```

Un ADC qui donnerait −350 mV après formule sera **refusé** pour l’état principal (mais visible via attributs / entité `calibrated` si publiée).

**Piège :** des bornes trop serrées masquent un vrai changement chimique lent jusqu’à ce qu’une valeur « correcte » revienne.

---

### `publish_raw`

| | |
|--|--|
| **Rôle** | Si `true`, crée une **deuxième entité** Home Assistant (diagnostic) dont l’**état** est l’ADC brut — historisable normalement (contrairement aux attributs). |
| **Type** | Booléen. |
| **Obligatoire** | Non. |
| **Défaut** | **`false`**. Seul `true` active la fonction (pas la chaîne `"true"` côté schéma booléen HA). |

**Entité créée (conceptuellement) :**  
`<nom> raw` — unité affichée `ADC`, catégorie diagnostic.

**À quoi ça sert :** superposer sur un graphe HA le **raw** et le débit / le mV pour diagnostiquer un palier matériel (si le raw bascule et reste bas, ce n’est pas « l’historique d’attributs » qui ment).

**Si vous repassez à `false` :** l’add-on publie une config discovery vide (retain) pour retirer l’entité zombie.

---

### `publish_calibrated`

| | |
|--|--|
| **Rôle** | Si `true` **et** qu’une calibration existe, crée une entité diagnostic dont l’état est la valeur **calibrée avant les gardes** (`max_jump` / min / max). |
| **Type** | Booléen. |
| **Obligatoire** | Non. |
| **Défaut** | **`false`**. Ignoré (avec log) s’il n’y a **pas** de `calibration_set` valide. |

**Différence avec l’entité principale :**

| Entité | Contenu |
|--------|---------|
| Principale (`name`) | Après calibration **et** gardes : peut **retenir** l’ancienne valeur. |
| `… calibrated` | Formule **tout de suite** (après `filter_samples` éventuel), **sans** bloquer sur min/max/saut. |

**Si vous n’utilisez aucune garde** (`max_jump`, `value_min`, `value_max`), principale ≈ calibrated : le companion apporte peu.  
Dans ce cas, **`publish_raw: true`** est en général le plus utile pour le diagnostic.

---

### Attributs MQTT de l’entité principale (toujours présents dans le JSON)

Même sans companions, le payload d’état contient des attributs (peu pratiques à historiser dans HA, d’où `publish_raw`) :

| Attribut | Signification |
|----------|----------------|
| `raw_value` | ADC de l’échantillon courant (post médiane d’intervalle J5). |
| `filtered_raw` | Après `filter_samples` (identique à raw si fenêtre = 1). |
| `calibrated` | Après courbe de calibration (ou = filtered_raw sans courbe). |
| `accepted` | `true` si la valeur a mis à jour le baseline de l’état principal. |
| `reject_reason` | `null`, ou `max_jump`, `max_jump_accepted`, `below_min`, `above_max`, `nan`, … |
| `jump_streak` | Compteur de rejets consécutifs liés à `max_jump`. |
| `dfrobot_offset` | Présent si `calibration_type: dfrobot_orp` : OFFSET appliqué (mV). |

---

### Exemple complet — sonde redox (diagnostic + calib)

```yaml
sensors:
  - name: Sonde Redox
    pin: A4
    unit: mv
    freq: 5000
    threshold: 3
    device_class: voltage
    state_class: measurement
    calibration_set: redox
    calibration_type: linear
    publish_raw: true
    publish_calibrated: true
    # Optionnel — lissage / protection automations :
    # filter_samples: 5
    # max_jump: 80
    # max_jump_streak: 5
    # value_min: 250
    # value_max: 950
```

---

## 6. `thermometers` — température

### `name`

Nom affiché. Avec `AUTO-DS18B20`, **plusieurs** entités peuvent être créées (une par adresse détectée) ; le nom de config sert de base, l’adresse distingue les devices.

### `pin`

Broche du bus **1-Wire** ou de la sonde selon le `controler`.

### `controler`

| | |
|--|--|
| **Rôle** | Type de contrôleur Johnny-Five / stratégie de détection. |
| **Type** | Liste du schéma : `ANALOG`, `LM35`, `TMP36`, `DS18B20`, `AUTO-DS18B20`, `MPU6050`, etc. |
| **Obligatoire** | Oui. |
| **Orthographe** | **`controler`** (sans « l » au milieu) — c’est le nom du champ dans la config de l’add-on. `controller` ne sera **pas** lu. |

**Cas particulier `AUTO-DS18B20` :**

- Lance une recherche 1-Wire sur `pin`.
- Crée **une entité par sonde** trouvée.
- Très pratique en multi-sondes sur le même bus.

**`DS18B20` (sans AUTO) :** plutôt une sonde adressée ; voir `address`.

### `address`

| | |
|--|--|
| **Rôle** | Adresse 1-Wire lorsque vous ne passez pas par AUTO. |
| **Type** | Chaîne. |
| **Obligatoire** | Non (souvent omise avec `AUTO-DS18B20`). |
| **Défaut** | Auto-détection selon le mode. |

### `unit`

| | |
|--|--|
| **Rôle** | Unité de température. |
| **Type** | `°C`, `°F` ou `K`. |
| **Obligatoire** | Non. |
| **Défaut** | **`°C`**. |

### `freq`

| | |
|--|--|
| **Rôle** | Période de lecture en **ms**. |
| **Type** | Entier. |
| **Obligatoire** | Non. |
| **Défaut** | Souvent **1000** ms dans les chemins de code si omis. |

**Attention DS18B20 :** des `freq` **trop grands** (commentaires historiques du code : prudence au-delà de ~5 s selon chemins) peuvent interagir avec des timeouts de bus. En `AUTO-DS18B20`, des valeurs comme `15000` ou `60000` sont utilisées en pratique par certains utilisateurs ; si des lectures disparaissent, testez une période plus courte.

**Exemple :**

```yaml
thermometers:
  - name: Air
    pin: "12"
    controler: AUTO-DS18B20
    freq: 60000
  - name: Eau
    pin: "3"
    controler: AUTO-DS18B20
    freq: 60000
```

---

## 7. Exemple de configuration complète (piscine)

```yaml
baudrate: "115200"
discovery_topic: homeassistant
device: /dev/serial/by-id/usb-Arduino__www.arduino.cc__0043_24236323730351306161-if00

calibration_sets:
  - set: sand_filter
    x_point: 103
    y_point: 0.2
  - set: sand_filter
    x_point: 137
    y_point: 0.72
  - set: sand_filter
    x_point: 159
    y_point: 1
  - set: redox
    x_point: 302
    y_point: 650
  - set: PH
    x_point: 328
    y_point: 4
  - set: PH
    x_point: 498
    y_point: 7.4
  - set: PH
    x_point: 658
    y_point: 10.01

binary_sensors:
  - name: Détecteur de débit
    pin: "11"
    device_class: running
    invert: true
    type: NC

relays:
  - name: Relay 4
    pin: "5"
    type: "NO"
  - name: Relay 3
    pin: "6"
    type: "NO"
  - name: Relay 2
    pin: "7"
    type: "NO"
  - name: Relay 1
    pin: "8"
    type: "NO"
    device_class: switch

sensors:
  - name: Pression Filtre à Sable
    pin: A0
    unit: bar
    freq: 1000
    device_class: pressure
    threshold: 2
    calibration_set: sand_filter
    calibration_type: polynomial
    calibration_order: 3

  - name: Sonde Redox
    pin: A4
    unit: mv
    freq: 10000
    calibration_set: redox
    calibration_type: dfrobot_orp
    publish_raw: true
    publish_calibrated: true
    # filter_samples: 7
    # max_jump: 80
    # max_jump_streak: 5
    # value_min: 100
    # value_max: 950

  - name: Sonde PH
    pin: A5
    unit: ph
    freq: 12000
    calibration_set: PH
    calibration_type: polynomial
    calibration_order: 3
    calibration_precision: 20

thermometers:
  - name: Air Thermometers
    pin: "12"
    controler: AUTO-DS18B20
    freq: 60000
  - name: Water Thermometer
    pin: "3"
    controler: AUTO-DS18B20
    freq: 60000
```

---

## 8. Logs utiles au démarrage

Avec une version récente de l’add-on, les logs console contiennent notamment :

- chemin `device` configuré et chemin **résolu** (ex. `by-id` → `/dev/ttyACM0`) ;
- tentative d’identification USB (souvent via le nom `by-id` dans le conteneur HA, les métadonnées udev étant parfois vides) ;
- firmware Firmata (`ConfigurableFirmata`, version, `RESOLUTION.ADC` : **1023** ≈ 10 bits, **4095** ≈ 12 bits) ;
- équation de régression et **r²** pour chaque capteur calibré.

Activez le niveau de log de l’add-on si besoin pour le debug.

---

## 9. MQTT et Home Assistant

- Broker : fourni par le service Supervisor **mqtt** (credentials injectés automatiquement).
- Discovery : topics sous `discovery_topic` (défaut `homeassistant/.../config`).
- États capteurs : JSON retenu sur `j5_ha_bridge/sensor/<unique_id>` (entre autres).
- Après changement de config : **redémarrer l’add-on** pour ré-annoncer les entités.
- Si une entité diagnostic n’apparaît pas : vérifier `publish_raw: true` (booléen YAML `true`, pas la chaîne), redémarrer, recharger l’intégration MQTT si nécessaire.

---

## 10. Limites et bonnes pratiques

1. **Un seul Arduino** par instance d’add-on (un `device`).
2. **Calibration** : toujours calibrer sur le **raw ADC** de *votre* installation (Vref, carte d’isolation, ampli).
3. **Redox / pH** : hors débit d’eau, les valeurs sont souvent peu fiables ; couplez aux binary_sensors de débit dans vos automations.
4. **Filtres logiciels** (`max_jump`, min/max) protègent les automations ; ils ne « réparent » pas une sonde ou une masse électrique défectueuse.
5. **Chien de garde** add-on : utile si Firmata redémarre (l’add-on peut s’arrêter volontairement pour être relancé proprement).

---

## Support

- Issues GitHub : [https://github.com/echavet/j5_ha_bridge](https://github.com/echavet/j5_ha_bridge)
- Vérifiez d’abord les logs de l’add-on (connexion série, équation de calib, erreurs de configuration).

---

## Licence / auteur

Voir le dépôt. Maintenu dans le cadre du projet personnel / communauté Home Assistant + Johnny-Five.
