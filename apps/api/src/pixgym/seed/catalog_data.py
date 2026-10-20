"""Wbudowany katalog: partie mięśniowe, sprzęt, wzorce ruchu i ćwiczenia.

ID słowników są stałe (nie zmieniać, tylko dopisywać). Ćwiczenia identyfikuje slug.
"""

from typing import NamedTuple

# (id, slug, nazwa, region)
MUSCLE_GROUPS = [
    (1, "chest", "Klatka piersiowa", "upper"),
    (2, "lats", "Najszersze grzbietu", "upper"),
    (3, "upper_back", "Górna część pleców", "upper"),
    (4, "traps", "Kaptury", "upper"),
    (5, "front_delts", "Przedni akton barków", "upper"),
    (6, "side_delts", "Boczny akton barków", "upper"),
    (7, "rear_delts", "Tylny akton barków", "upper"),
    (8, "biceps", "Biceps", "upper"),
    (9, "triceps", "Triceps", "upper"),
    (10, "forearms", "Przedramiona", "upper"),
    (11, "abs", "Mięśnie proste brzucha", "core"),
    (12, "obliques", "Mięśnie skośne brzucha", "core"),
    (13, "lower_back", "Prostowniki grzbietu", "core"),
    (14, "quads", "Czworogłowe uda", "lower"),
    (15, "hamstrings", "Dwugłowe uda", "lower"),
    (16, "glutes", "Pośladki", "lower"),
    (17, "adductors", "Przywodziciele", "lower"),
    (18, "abductors", "Odwodziciele", "lower"),
    (19, "calves", "Łydki", "lower"),
]

# (id, slug, nazwa)
EQUIPMENT = [
    (1, "barbell", "Sztanga"),
    (2, "dumbbell", "Hantle"),
    (3, "kettlebell", "Kettlebell"),
    (4, "machine", "Maszyna"),
    (5, "cable", "Wyciąg"),
    (6, "smith", "Suwnica Smitha"),
    (7, "bodyweight", "Masa ciała"),
    (8, "band", "Guma"),
    (9, "ez_bar", "Sztanga łamana"),
    (10, "trap_bar", "Trap bar"),
    (11, "plate", "Talerz"),
    (12, "other", "Inne"),
]

# (id, slug, nazwa)
MOVEMENT_PATTERNS = [
    (1, "push", "Pchanie"),
    (2, "pull", "Przyciąganie"),
    (3, "squat", "Przysiad"),
    (4, "hinge", "Zawias biodrowy"),
    (5, "lunge", "Wykrok"),
    (6, "carry", "Noszenie"),
    (7, "core", "Korpus"),
]


class Ex(NamedTuple):
    slug: str
    name: str
    equipment: str
    pattern: str | None
    primary: str  # partie główne, oddzielone spacją
    secondary: str = ""  # partie pomocnicze
    tracking: str = "weight_reps"
    unilateral: bool = False
    bw_factor: float | None = None


BW = "bodyweight_reps"

EXERCISES = [
    # --- Klatka ---
    Ex("bench_press", "Wyciskanie sztangi leżąc", "barbell", "push", "chest", "front_delts triceps"),
    Ex("paused_bench_press", "Wyciskanie leżąc z pauzą", "barbell", "push", "chest", "front_delts triceps"),
    Ex("incline_bench_press", "Wyciskanie sztangi na skosie dodatnim", "barbell", "push", "chest front_delts", "triceps"),
    Ex("decline_bench_press", "Wyciskanie sztangi na skosie ujemnym", "barbell", "push", "chest", "triceps front_delts"),
    Ex("close_grip_bench_press", "Wyciskanie sztangi wąsko", "barbell", "push", "triceps chest", "front_delts"),
    Ex("floor_press", "Wyciskanie z podłogi", "barbell", "push", "chest triceps", "front_delts"),
    Ex("smith_bench_press", "Wyciskanie leżąc na suwnicy Smitha", "smith", "push", "chest", "front_delts triceps"),
    Ex("smith_incline_press", "Wyciskanie na skosie na suwnicy Smitha", "smith", "push", "chest front_delts", "triceps"),
    Ex("db_bench_press", "Wyciskanie hantli leżąc", "dumbbell", "push", "chest", "front_delts triceps"),
    Ex("db_incline_press", "Wyciskanie hantli na skosie dodatnim", "dumbbell", "push", "chest front_delts", "triceps"),
    Ex("db_fly", "Rozpiętki z hantlami", "dumbbell", "push", "chest", "front_delts"),
    Ex("incline_db_fly", "Rozpiętki z hantlami na skosie", "dumbbell", "push", "chest", "front_delts"),
    Ex("machine_chest_press", "Wyciskanie na maszynie (chest press)", "machine", "push", "chest", "front_delts triceps"),
    Ex("machine_incline_press", "Wyciskanie na skosie na maszynie", "machine", "push", "chest front_delts", "triceps"),
    Ex("pec_deck", "Butterfly (pec deck)", "machine", "push", "chest", "front_delts"),
    Ex("cable_crossover", "Krzyżowanie linek wyciągu", "cable", "push", "chest", "front_delts"),
    Ex("low_to_high_cable_fly", "Rozpiętki linkami z dołu", "cable", "push", "chest", "front_delts"),
    Ex("push_up", "Pompki", "bodyweight", "push", "chest", "triceps front_delts abs", BW, bw_factor=0.65),
    Ex("dip", "Pompki na poręczach", "bodyweight", "push", "chest triceps", "front_delts", BW, bw_factor=1.0),
    Ex("db_pullover", "Pullover z hantlem", "dumbbell", "pull", "lats", "chest triceps"),
    # --- Plecy ---
    Ex("deadlift", "Martwy ciąg", "barbell", "hinge", "glutes hamstrings lower_back", "quads traps upper_back forearms"),
    Ex("sumo_deadlift", "Martwy ciąg sumo", "barbell", "hinge", "glutes quads adductors", "hamstrings lower_back traps forearms"),
    Ex("deficit_deadlift", "Martwy ciąg z podwyższenia", "barbell", "hinge", "glutes hamstrings lower_back", "quads traps forearms"),
    Ex("rack_pull", "Martwy ciąg z bloków (rack pull)", "barbell", "hinge", "lower_back glutes traps", "hamstrings upper_back forearms"),
    Ex("trap_bar_deadlift", "Martwy ciąg z trap barem", "trap_bar", "hinge", "quads glutes hamstrings", "lower_back traps forearms"),
    Ex("romanian_deadlift", "Martwy ciąg rumuński", "barbell", "hinge", "hamstrings glutes", "lower_back forearms"),
    Ex("stiff_leg_deadlift", "Martwy ciąg na prostych nogach", "barbell", "hinge", "hamstrings glutes", "lower_back"),
    Ex("db_romanian_deadlift", "Martwy ciąg rumuński z hantlami", "dumbbell", "hinge", "hamstrings glutes", "lower_back forearms"),
    Ex("single_leg_rdl", "Martwy ciąg rumuński na jednej nodze", "dumbbell", "hinge", "hamstrings glutes", "lower_back", unilateral=True),
    Ex("good_morning", "Skłony ze sztangą (good morning)", "barbell", "hinge", "hamstrings lower_back", "glutes"),
    Ex("barbell_row", "Wiosłowanie sztangą w opadzie", "barbell", "pull", "upper_back lats", "rear_delts biceps lower_back"),
    Ex("pendlay_row", "Wiosłowanie Pendlay", "barbell", "pull", "upper_back lats", "rear_delts biceps lower_back"),
    Ex("seal_row", "Wiosłowanie leżąc na ławce (seal row)", "barbell", "pull", "upper_back lats", "rear_delts biceps"),
    Ex("t_bar_row", "Wiosłowanie T-bar", "barbell", "pull", "upper_back lats", "rear_delts biceps lower_back"),
    Ex("meadows_row", "Wiosłowanie Meadowsa", "barbell", "pull", "lats upper_back", "rear_delts biceps", unilateral=True),
    Ex("db_row", "Wiosłowanie hantlem jednorącz", "dumbbell", "pull", "lats upper_back", "rear_delts biceps", unilateral=True),
    Ex("db_bent_over_row", "Wiosłowanie hantlami w opadzie", "dumbbell", "pull", "upper_back lats", "rear_delts biceps lower_back"),
    Ex("chest_supported_row", "Wiosłowanie hantlami z podparciem klatki", "dumbbell", "pull", "upper_back lats", "rear_delts biceps"),
    Ex("seated_cable_row", "Przyciąganie linki siedząc", "cable", "pull", "upper_back lats", "rear_delts biceps"),
    Ex("single_arm_cable_row", "Przyciąganie linki jednorącz", "cable", "pull", "lats upper_back", "rear_delts biceps", unilateral=True),
    Ex("machine_row", "Wiosłowanie na maszynie", "machine", "pull", "upper_back lats", "rear_delts biceps"),
    Ex("pull_up", "Podciąganie nachwytem", "bodyweight", "pull", "lats", "biceps upper_back forearms", BW, bw_factor=1.0),
    Ex("chin_up", "Podciąganie podchwytem", "bodyweight", "pull", "lats biceps", "upper_back forearms", BW, bw_factor=1.0),
    Ex("neutral_grip_pull_up", "Podciąganie chwytem neutralnym", "bodyweight", "pull", "lats", "biceps upper_back forearms", BW, bw_factor=1.0),
    Ex("assisted_pull_up", "Podciąganie na maszynie z asystą", "machine", "pull", "lats", "biceps upper_back", BW, bw_factor=1.0),
    Ex("inverted_row", "Wiosłowanie australijskie", "bodyweight", "pull", "upper_back lats", "biceps rear_delts", BW, bw_factor=0.6),
    Ex("lat_pulldown", "Ściąganie drążka wyciągu górnego", "cable", "pull", "lats", "biceps upper_back"),
    Ex("close_grip_pulldown", "Ściąganie wyciągu górnego wąskim chwytem", "cable", "pull", "lats", "biceps upper_back"),
    Ex("straight_arm_pulldown", "Ściąganie linki prostymi rękami", "cable", "pull", "lats", "triceps"),
    Ex("shrug", "Szrugsy ze sztangą", "barbell", "pull", "traps", "forearms"),
    Ex("db_shrug", "Szrugsy z hantlami", "dumbbell", "pull", "traps", "forearms"),
    Ex("back_extension", "Prostowanie tułowia na ławce rzymskiej", "bodyweight", "hinge", "lower_back glutes", "hamstrings", BW, bw_factor=0.5),
    # --- Barki ---
    Ex("overhead_press", "Wyciskanie żołnierskie (OHP)", "barbell", "push", "front_delts", "triceps side_delts abs"),
    Ex("push_press", "Wyciskanie z wybiciem (push press)", "barbell", "push", "front_delts triceps", "side_delts quads glutes"),
    Ex("z_press", "Z-press", "barbell", "push", "front_delts", "triceps side_delts abs"),
    Ex("db_shoulder_press", "Wyciskanie hantli nad głowę", "dumbbell", "push", "front_delts", "triceps side_delts"),
    Ex("arnold_press", "Wyciskanie Arnolda", "dumbbell", "push", "front_delts side_delts", "triceps"),
    Ex("machine_shoulder_press", "Wyciskanie nad głowę na maszynie", "machine", "push", "front_delts", "triceps side_delts"),
    Ex("landmine_press", "Wyciskanie landmine", "barbell", "push", "front_delts", "chest triceps", unilateral=True),
    Ex("handstand_push_up", "Pompki w staniu na rękach", "bodyweight", "push", "front_delts triceps", "side_delts traps", BW, bw_factor=0.9),
    Ex("lateral_raise", "Wznosy hantli bokiem", "dumbbell", "push", "side_delts", "traps"),
    Ex("cable_lateral_raise", "Wznosy bokiem na wyciągu", "cable", "push", "side_delts", "traps", unilateral=True),
    Ex("machine_lateral_raise", "Wznosy bokiem na maszynie", "machine", "push", "side_delts", "traps"),
    Ex("front_raise", "Wznosy hantli w przód", "dumbbell", "push", "front_delts", "side_delts"),
    Ex("upright_row", "Wiosłowanie stojąc wzdłuż tułowia", "barbell", "pull", "side_delts traps", "biceps"),
    Ex("face_pull", "Face pull", "cable", "pull", "rear_delts", "upper_back traps"),
    Ex("reverse_fly", "Odwrotne rozpiętki z hantlami", "dumbbell", "pull", "rear_delts", "upper_back"),
    Ex("reverse_pec_deck", "Odwrotny butterfly", "machine", "pull", "rear_delts", "upper_back"),
    # --- Biceps i przedramiona ---
    Ex("barbell_curl", "Uginanie ramion ze sztangą", "barbell", "pull", "biceps", "forearms"),
    Ex("ez_bar_curl", "Uginanie ramion sztangą łamaną", "ez_bar", "pull", "biceps", "forearms"),
    Ex("db_curl", "Uginanie ramion z hantlami", "dumbbell", "pull", "biceps", "forearms"),
    Ex("hammer_curl", "Uginanie młotkowe", "dumbbell", "pull", "biceps forearms"),
    Ex("incline_db_curl", "Uginanie ramion na ławce skośnej", "dumbbell", "pull", "biceps", "forearms"),
    Ex("preacher_curl", "Uginanie na modlitewniku", "ez_bar", "pull", "biceps", "forearms"),
    Ex("spider_curl", "Uginanie w opadzie na ławce (spider curl)", "dumbbell", "pull", "biceps"),
    Ex("concentration_curl", "Uginanie w koncentracji", "dumbbell", "pull", "biceps", unilateral=True),
    Ex("cable_curl", "Uginanie ramion na wyciągu", "cable", "pull", "biceps", "forearms"),
    Ex("bayesian_curl", "Uginanie na wyciągu tyłem (bayesian curl)", "cable", "pull", "biceps", unilateral=True),
    Ex("machine_curl", "Uginanie ramion na maszynie", "machine", "pull", "biceps"),
    Ex("reverse_curl", "Uginanie ramion nachwytem", "ez_bar", "pull", "forearms biceps"),
    Ex("wrist_curl", "Uginanie nadgarstków", "dumbbell", "pull", "forearms"),
    # --- Triceps ---
    Ex("triceps_pushdown", "Prostowanie ramion na wyciągu (linka)", "cable", "push", "triceps"),
    Ex("bar_pushdown", "Prostowanie ramion na wyciągu (drążek)", "cable", "push", "triceps"),
    Ex("overhead_cable_extension", "Prostowanie ramion nad głową na wyciągu", "cable", "push", "triceps"),
    Ex("skull_crusher", "Wyciskanie francuskie leżąc", "ez_bar", "push", "triceps"),
    Ex("db_overhead_extension", "Wyciskanie francuskie hantlem nad głową", "dumbbell", "push", "triceps"),
    Ex("jm_press", "JM press", "barbell", "push", "triceps", "chest"),
    Ex("triceps_kickback", "Prostowanie ramienia w opadzie (kickback)", "dumbbell", "push", "triceps", unilateral=True),
    Ex("bench_dip", "Pompki w podporze tyłem", "bodyweight", "push", "triceps", "chest front_delts", BW, bw_factor=0.5),
    Ex("machine_dip", "Pompki na poręczach na maszynie", "machine", "push", "triceps chest", "front_delts"),
    # --- Przysiady ---
    Ex("back_squat", "Przysiad ze sztangą na plecach", "barbell", "squat", "quads glutes", "adductors lower_back"),
    Ex("paused_squat", "Przysiad z pauzą", "barbell", "squat", "quads glutes", "adductors lower_back"),
    Ex("front_squat", "Przysiad przedni", "barbell", "squat", "quads", "glutes upper_back abs"),
    Ex("box_squat", "Przysiad do skrzyni", "barbell", "squat", "quads glutes", "hamstrings lower_back"),
    Ex("safety_bar_squat", "Przysiad z gryfem safety bar", "barbell", "squat", "quads glutes", "upper_back lower_back"),
    Ex("zercher_squat", "Przysiad Zerchera", "barbell", "squat", "quads glutes", "upper_back abs"),
    Ex("smith_squat", "Przysiad na suwnicy Smitha", "smith", "squat", "quads glutes"),
    Ex("goblet_squat", "Przysiad goblet", "dumbbell", "squat", "quads glutes", "abs"),
    Ex("hack_squat", "Hack przysiad na maszynie", "machine", "squat", "quads", "glutes"),
    Ex("belt_squat", "Przysiad z pasem (belt squat)", "machine", "squat", "quads glutes", "adductors"),
    Ex("leg_press", "Wypychanie nogami na suwnicy", "machine", "squat", "quads glutes", "adductors"),
    Ex("pistol_squat", "Przysiad na jednej nodze (pistolet)", "bodyweight", "squat", "quads glutes", "abs", BW, True, 1.0),
    Ex("leg_extension", "Prostowanie nóg na maszynie", "machine", "squat", "quads"),
    # --- Wykroki ---
    Ex("bulgarian_split_squat", "Przysiad bułgarski", "dumbbell", "lunge", "quads glutes", "adductors", unilateral=True),
    Ex("split_squat", "Przysiad wykroczny ze sztangą", "barbell", "lunge", "quads glutes", "adductors", unilateral=True),
    Ex("walking_lunge", "Wykroki chodzone", "dumbbell", "lunge", "quads glutes", "adductors hamstrings"),
    Ex("reverse_lunge", "Wykroki w tył", "dumbbell", "lunge", "quads glutes", "adductors", unilateral=True),
    Ex("step_up", "Wejścia na skrzynię", "dumbbell", "lunge", "quads glutes", "hamstrings", unilateral=True),
    # --- Tył uda i pośladki ---
    Ex("lying_leg_curl", "Uginanie nóg leżąc na maszynie", "machine", "hinge", "hamstrings", "calves"),
    Ex("seated_leg_curl", "Uginanie nóg siedząc na maszynie", "machine", "hinge", "hamstrings"),
    Ex("nordic_curl", "Nordic curl", "bodyweight", "hinge", "hamstrings", "", BW, bw_factor=0.7),
    Ex("glute_ham_raise", "Glute-ham raise", "bodyweight", "hinge", "hamstrings", "glutes", BW, bw_factor=0.6),
    Ex("hip_thrust", "Hip thrust ze sztangą", "barbell", "hinge", "glutes", "hamstrings"),
    Ex("glute_bridge", "Mostek biodrowy ze sztangą", "barbell", "hinge", "glutes", "hamstrings"),
    Ex("cable_pull_through", "Przeciąganie linki między nogami (pull-through)", "cable", "hinge", "glutes hamstrings"),
    Ex("kettlebell_swing", "Swing kettlebell", "kettlebell", "hinge", "glutes hamstrings", "lower_back"),
    Ex("cable_kickback", "Wykop nogi w tył na wyciągu", "cable", "hinge", "glutes", unilateral=True),
    Ex("hip_abduction", "Odwodzenie nóg na maszynie", "machine", None, "abductors", "glutes"),
    Ex("hip_adduction", "Przywodzenie nóg na maszynie", "machine", None, "adductors"),
    # --- Łydki ---
    Ex("standing_calf_raise", "Wspięcia na palce stojąc", "machine", None, "calves"),
    Ex("seated_calf_raise", "Wspięcia na palce siedząc", "machine", None, "calves"),
    Ex("leg_press_calf_raise", "Wspięcia na palce na suwnicy", "machine", None, "calves"),
    Ex("single_leg_calf_raise", "Wspięcia na palce na jednej nodze", "dumbbell", None, "calves", unilateral=True),
    # --- Brzuch ---
    Ex("plank", "Deska", "bodyweight", "core", "abs", "obliques", "duration"),
    Ex("side_plank", "Deska bokiem", "bodyweight", "core", "obliques", "abs", "duration", True),
    Ex("hollow_hold", "Hollow hold", "bodyweight", "core", "abs", "", "duration"),
    Ex("l_sit", "L-sit", "bodyweight", "core", "abs", "triceps", "duration"),
    Ex("hanging_leg_raise", "Unoszenie nóg w zwisie", "bodyweight", "core", "abs", "obliques forearms", BW, bw_factor=0.3),
    Ex("hanging_knee_raise", "Unoszenie kolan w zwisie", "bodyweight", "core", "abs", "forearms", BW, bw_factor=0.25),
    Ex("crunch", "Spięcia brzucha", "bodyweight", "core", "abs", "", BW, bw_factor=0.3),
    Ex("decline_sit_up", "Brzuszki na ławce skośnej", "bodyweight", "core", "abs", "", BW, bw_factor=0.4),
    Ex("cable_crunch", "Spięcia brzucha na wyciągu (allahy)", "cable", "core", "abs"),
    Ex("ab_wheel", "Wałek do brzucha (rollout)", "other", "core", "abs", "lats", BW, bw_factor=0.5),
    Ex("dead_bug", "Dead bug", "bodyweight", "core", "abs", "", BW, bw_factor=0.2),
    Ex("russian_twist", "Rosyjski skręt", "plate", "core", "obliques", "abs"),
    Ex("pallof_press", "Pallof press", "cable", "core", "obliques abs", unilateral=True),
    Ex("woodchopper", "Drwal na wyciągu", "cable", "core", "obliques", "abs", unilateral=True),
    # --- Noszenie i chwyt ---
    Ex("farmer_walk", "Spacer farmera", "dumbbell", "carry", "forearms traps", "abs glutes", "distance"),
    Ex("suitcase_carry", "Spacer z walizką", "dumbbell", "carry", "obliques forearms", "traps", "distance", True),
    Ex("dead_hang", "Zwis na drążku", "bodyweight", "pull", "forearms", "lats", "duration"),
    # --- Dynamiczne ---
    Ex("power_clean", "Zarzut siłowy (power clean)", "barbell", "hinge", "glutes hamstrings traps", "quads upper_back"),
    Ex("hang_power_clean", "Zarzut siłowy z zawisu", "barbell", "hinge", "glutes hamstrings traps", "upper_back"),
    Ex("box_jump", "Wskoki na skrzynię", "bodyweight", "squat", "quads glutes", "calves", BW, bw_factor=1.0),
    Ex("sled_push", "Pchanie sań", "other", None, "quads glutes", "calves", "distance"),
    # --- Kardio ---
    Ex("rowing_machine", "Ergometr wioślarski", "machine", None, "upper_back lats quads", "biceps glutes", "distance"),
    Ex("stationary_bike", "Rower stacjonarny", "machine", None, "quads", "glutes calves", "duration"),
    Ex("treadmill", "Bieżnia", "machine", None, "quads hamstrings calves", "glutes", "distance"),
    Ex("stair_climber", "Schody ruchome (stepper)", "machine", None, "quads glutes", "calves", "duration"),
    Ex("jump_rope", "Skakanka", "other", None, "calves", "quads", "duration"),
    Ex("assault_bike", "Rower powietrzny (air bike)", "machine", None, "quads", "glutes front_delts", "duration"),
]
