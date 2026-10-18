const Hyperparams = require("../../Hyperparameters");
const CellStates = require("../Cell/CellStates");

const Decision = {
    neutral: 0,
    retreat: 1,
    chase: 2,
    move_left: 3,
    move_right: 4,
    stop: 5,
    turn_left: 6,
    turn_right: 7,
    getRandom: function() {
        const range = Hyperparams.rotationEnabled ? 8 : 6
        return Math.floor(Math.random() * range);
    }
}

// the brain takes eye observations in -> movement decision out
// it operates as a state machine (the brain state), and has independent logic for each eye
// each eye has a list of decision maps, one for each brain state
// each decision map is a map from (observed cell state) -> (movement decision, next brain state)
// (action,next_state) = decisions[eye_index][state_index][observed_cell]
// the nearest eye's observations is the one that determines the action

class Brain {
    constructor(owner) {
        this.owner = owner;
        this.num_states = 1;
        this.state = 0;
        this.observations = [];
        this.decisions = [[this.newDecisionMap()]];
        this.eye_cell_count = 0;
        this.independent_eye_decisions = false;
    }

    // Ensure every brain state contains an entry for every registered cell type.
    // This repairs older saved brains after new cell types are added.
    ensureDecisionMaps() {
        if (!Array.isArray(this.decisions)) {
            this.decisions = [];
        }

        if (this.decisions.length === 0) {
            this.num_states = Math.max(1, this.num_states || 1);
            this.decisions = [];

            const eyeCount = this.independent_eye_decisions
                ? Math.max(1, this.eye_cell_count)
                : 1;

            for (let i = 0; i < eyeCount; i++) {
                const eye = [];
                for (let s = 0; s < this.num_states; s++) {
                    eye.push(this.newDecisionMap());
                }
                this.decisions.push(eye);
            }
        }

        // Determine the authoritative state count from the first eye.
        if (!Array.isArray(this.decisions[0])) {
            this.decisions[0] = [this.newDecisionMap()];
        }

        this.num_states = Math.max(1, this.decisions[0].length);

        for (const eye of this.decisions) {
            if (!Array.isArray(eye)) {
                continue;
            }

            // Fill missing brain states.
            while (eye.length < this.num_states) {
                eye.push(this.newDecisionMap());
            }

            // Repair each decision map.
            for (let i = 0; i < eye.length; i++) {
                if (
                    !eye[i] ||
                    typeof eye[i] !== "object" ||
                    Array.isArray(eye[i])
                ) {
                    eye[i] = this.newDecisionMap();
                }

                const stateMap = eye[i];

                for (const cell of CellStates.all) {
                    if (
                        !stateMap[cell.name] ||
                        typeof stateMap[cell.name] !== "object"
                    ) {
                        stateMap[cell.name] = {
                            decision: Decision.getRandom(),
                            state: 0
                        };

                        if (cell.name === CellStates.food.name) {
                            stateMap[cell.name].decision = Decision.chase;
                        }

                        if (cell.name === CellStates.killer.name) {
                            stateMap[cell.name].decision = Decision.retreat;
                        }
                    }

                    const entry = stateMap[cell.name];

                    if (
                        !Number.isInteger(entry.state) ||
                        entry.state < 0 ||
                        entry.state >= this.num_states
                    ) {
                        entry.state = 0;
                    }

                    if (
                        !Number.isInteger(entry.decision) ||
                        entry.decision < 0 ||
                        entry.decision > Decision.turn_right
                    ) {
                        entry.decision = Decision.getRandom();
                    }
                }
            }
        }

        // Repair the currently active brain state.
        if (
            !Number.isInteger(this.state) ||
            this.state < 0 ||
            this.state >= this.num_states
        ) {
            this.state = 0;
        }
    }

    checkAddedCell(cell) {
        if (cell.state.name === CellStates.eye.name) {
            this.fillEyeDecisions();
            this.eye_cell_count++;
        }
    }

    checkRemovedCell(cell) {
        if (cell.state.name === CellStates.eye.name) {
            if (this.independent_eye_decisions && this.decisions.length > 1) {
                let eye_index = -1;
                for (const c of this.owner.anatomy.cells) {
                    if (c.state.name === CellStates.eye.name) {
                        eye_index++;
                    }
                    if (c === cell) {
                        break;
                    }
                }
                if (eye_index !== -1 && this.decisions.length > 1) {
                    this.decisions.splice(eye_index, 1);
                }
            }
            this.eye_cell_count--;
        }
    }

    countCells() {
        this.eye_cell_count = 0;
        for (const cell of this.owner.anatomy.cells) {
            if (cell.state.name === CellStates.eye.name) {
                this.eye_cell_count++;
            }
        }
    }

    fillEyeDecisions() {
        if (!this.independent_eye_decisions) {
            return;
        }
        let last_eye_copy = null;
        if (this.decisions.length > 0) {
            last_eye_copy = deepCopy(
                this.decisions[this.decisions.length - 1]
            );
        }
        this.countCells();
        while (this.decisions.length < this.eye_cell_count) {
            if (!last_eye_copy) {
                const eyeStates = [];
                for (let s = 0; s < this.num_states; s++) {eyeStates.push(this.newDecisionMap());}
                this.decisions.push(eyeStates);
                last_eye_copy = deepCopy(eyeStates);
            } else {
                this.decisions.push(deepCopy(last_eye_copy));
            }
        }
        this.ensureDecisionMaps();
    }

    setIndependentEyeDecisions(val) {
        if (this.independent_eye_decisions === val) {
            return;
        }
        this.independent_eye_decisions = val;
        if (!val) {
            this.decisions = this.decisions.length > 0
                ? [this.decisions[0]]: [[this.newDecisionMap()]];
        } else {
            this.fillEyeDecisions();
        }
        this.ensureDecisionMaps();
    }

    newBrainState(randomize_connections = true) {
        this.ensureDecisionMaps();
        if (this.num_states >= 10) {
            return;
        }
        this.num_states++;
        for (const eye of this.decisions) {
            const last_state = eye[eye.length - 1];
            if (last_state) {
                eye.push(deepCopy(last_state));
            } else {
                eye.push(this.newDecisionMap());
            }
        }
        if (!randomize_connections) {
            return;
        }
        const numMut = Math.max(1,Math.floor(
                Math.random() * this.decisions.length * this.num_states * 2
            )
        );

        for (let i = 0; i < numMut; i++) {
            const eyeIdx = Math.floor(
                Math.random() * this.decisions.length
            );

            if (!this.decisions[eyeIdx]) {
                continue;
            }

            const fromState = Math.floor(
                Math.random() * (this.num_states - 1)
            );

            const toState = this.num_states - 1;
            const cellType = CellStates.getRandomName();
            const entry = this.decisions[eyeIdx][fromState]?.[cellType];

            if (entry) {
                entry.state = toState;
            }
        }

        this.ensureDecisionMaps();
    }

    removeBrainState(index = -1) {
        this.ensureDecisionMaps();

        if (index === -1) {
            index = this.num_states - 1;
        }

        if (
            this.num_states <= 1 ||
            index < 0 ||
            index >= this.num_states
        ) {
            return;
        }

        const new_num_states = this.num_states - 1;

        for (const eye of this.decisions) {
            for (let i = 0; i < eye.length; i++) {
                if (i === index) {
                    continue;
                }

                const state = eye[i];

                for (const cell of CellStates.all) {
                    const entry = state[cell.name];

                    if (!entry) {
                        continue;
                    }

                    if (entry.state === index) {
                        entry.state = Math.floor(
                            Math.random() * new_num_states
                        );
                    } else if (entry.state > index) {
                        entry.state--;
                    }
                }
            }

            eye.splice(index, 1);
        }

        this.num_states = new_num_states;

        if (this.state >= this.num_states || this.state < 0) {
            this.state = 0;
        }

        this.ensureDecisionMaps();
    }

    newDecisionMap(default_decision = null) {
        const decisions = {};

        for (const cell of CellStates.all) {
            decisions[cell.name] = {
                decision: default_decision ?? Decision.getRandom(),
                state: Math.floor(Math.random() * this.num_states)
            };
        }

        if (CellStates.food) {
            decisions[CellStates.food.name].decision = Decision.chase;
        }

        if (CellStates.killer) {
            decisions[CellStates.killer.name].decision = Decision.retreat;
        }

        return decisions;
    }

    copy(brain) {
        this.decisions = [];
        this.observations = [];

        if (Array.isArray(brain.decisions)) {
            this.decisions = deepCopy(brain.decisions);
            this.independent_eye_decisions =
                !!brain.independent_eye_decisions;

            if (this.independent_eye_decisions) {
                this.countCells();
            }
        } else if (
            brain.decisions &&
            typeof brain.decisions === "object"
        ) {
            // Legacy single-map structure.
            const decisions_copy = deepCopy(brain.decisions);

            for (const cell of CellStates.all) {
                const oldValue = decisions_copy[cell.name];

                decisions_copy[cell.name] = {
                    decision:
                        typeof oldValue === "object"
                            ? oldValue.decision
                            : oldValue ?? Decision.getRandom(),
                    state:
                        typeof oldValue === "object"
                            ? oldValue.state ?? 0
                            : 0
                };
            }

            this.decisions.push([decisions_copy]);
            this.independent_eye_decisions = false;
        }

        if (this.decisions.length > 0 && this.decisions[0].length > 0) {
            this.num_states = this.decisions[0].length;
        } else {
            this.num_states = 1;
        }

        this.state = Number.isInteger(brain.state) ? brain.state : 0;

        this.ensureDecisionMaps();
    }

    randomizeDecisions() {
        this.ensureDecisionMaps();

        for (const eye of this.decisions) {
            for (const state of eye) {
                for (const cell of CellStates.all) {
                    state[cell.name].decision = Decision.getRandom();
                }
            }
        }
    }

    observe(observation) {
        this.observations.push(observation);
    }

    decide() {
        this.ensureDecisionMaps();

        let decision = {
            decision: Decision.neutral,
            state: this.state
        };

        let closest = Hyperparams.lookRange + 1;
        let move_direction = 0;

        for (let i = 0; i < this.observations.length; i++) {
            const obs = this.observations[i];

            if (
                obs.cell == null ||
                obs.cell.owner === this.owner ||
                !obs.cell.state
            ) {
                continue;
            }

            if (obs.distance < closest) {
                const eye_index =
                    i < this.decisions.length ? i : 0;

                const eye = this.decisions[eye_index];
                const stateMap = eye?.[this.state];
                const cellDecision =
                    stateMap?.[obs.cell.state.name];

                if (!cellDecision) {
                    console.warn(
                        "Missing brain decision; skipping observation:",
                        obs.cell.state.name
                    );
                    continue;
                }

                decision = cellDecision;
                move_direction = obs.direction;
                closest = obs.distance;
            }
        }

        this.observations = [];
        this.state = decision.state;

        return {
            decision: decision.decision,
            move_direction
        };
    }

    size() {
        return this.decisions.length *
            this.num_states *
            CellStates.all.length;
    }

    mutate() {
        this.ensureDecisionMaps();

        if (Math.random() < 0.25) {
            if (Math.random() < 0.5) {
                this.newBrainState();
            } else {
                this.removeBrainState();
            }
        }

        if (
            Hyperparams.evolveIndependentEyeDecisions &&
            Math.random() < 0.25
        ) {
            this.setIndependentEyeDecisions(
                !this.independent_eye_decisions
            );
        }

        this.ensureDecisionMaps();

        const num_mutations = Math.floor(
            Math.random() * this.size() / 2
        );

        for (let i = 0; i < num_mutations; i++) {
            if (this.decisions.length === 0 || this.num_states === 0) {
                break;
            }

            const eye_index = Math.floor(
                Math.random() * this.decisions.length
            );

            const eye = this.decisions[eye_index];

            if (!eye || eye.length === 0) {
                continue;
            }

            const state_index = Math.floor(
                Math.random() * eye.length
            );

            const state = eye[state_index];

            if (!state) {
                continue;
            }

            const cell_name = CellStates.getRandomName();
            const entry = state[cell_name];

            if (!entry) {
                continue;
            }

            if (Math.random() < 0.5) {
                entry.decision = Decision.getRandom();
            } else {
                entry.state = Math.floor(
                    Math.random() * this.num_states
                );
            }
        }

        this.ensureDecisionMaps();
    }

    serialize() {
        this.ensureDecisionMaps();

        return {
            decisions: this.decisions,
            independent_eye_decisions: this.independent_eye_decisions,
            state: this.state
        };
    }
}

function deepCopy(obj) {
    if (Array.isArray(obj)) {
        return obj.map(deepCopy);
    }

    if (typeof obj === "object" && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                key,
                deepCopy(value)
            ])
        );
    }

    return obj;
}

Brain.Decision = Decision;

module.exports = Brain;
