const Environment = require('./Environment');
const Renderer = require('../Rendering/Renderer');
const GridMap = require('../Grid/GridMap');
const Organism = require('../Organism/Organism');
const CellStates = require('../Organism/Cell/CellStates');
//-------------------GTZ
const Neighbors = require('../Grid/Neighbors');
const Directions = require('../Organism/Directions');
//--------------------
const EnvironmentController = require('../Controllers/EnvironmentController');
const Hyperparams = require('../Hyperparameters.js');
const FossilRecord = require('../Stats/FossilRecord');
const WorldConfig = require('../WorldConfig');
const SerializeHelper = require('../Utils/SerializeHelper');
const Species = require('../Stats/Species');

class WorldEnvironment extends Environment{
    constructor(engine, cell_size) {
        super();
        this.engine = engine;
        this.renderer = new Renderer('env-canvas', 'env', cell_size);
        this.controller = new EnvironmentController(this, this.renderer.canvas);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size);
        this.organisms = [];
        this.walls = [];
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
        FossilRecord.setEnv(this);
    }

    update() {
        var to_remove = [];
        for (var i in this.organisms) {
            var org = this.organisms[i];
            if (!org.living || !org.update()) {
                to_remove.push(i);
                continue;
            }
            //GTZ-----------------
            if (Hyperparams.theftChance > 0)
                this.theftStep(org);
            //--------------------
        }
        this.removeOrganisms(to_remove);
        if (Hyperparams.foodDropProb > 0) {
            this.generateFood();
        }
        this.total_ticks ++;
        if (this.total_ticks % this.data_update_rate == 0) {
            FossilRecord.updateData();
        }
    }

    render() {
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        this.renderer.renderCells();
        this.renderer.renderHighlights();
    }

    renderFull() {
        this.renderer.renderFullGrid(this.grid_map.grid);
    }

    removeOrganisms(org_indeces) {
        let start_pop = this.organisms.length;
        for (var i of org_indeces.reverse()){
            this.total_mutability -= this.organisms[i].mutability;
            this.organisms.splice(i, 1);
        }
        if (this.organisms.length === 0 && start_pop > 0) {
            if (WorldConfig.auto_pause)
                $('.pause-button')[0].click();
            else if(WorldConfig.auto_reset) {
                this.reset_count++;
                this.reset(false);
            }
        }
    }

    OriginOfLife() {
        var center = this.grid_map.getCenter();
        var org = new Organism(center[0], center[1], this);
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        org.anatomy.addDefaultCell(CellStates.producer, 1, 1);
        org.anatomy.addDefaultCell(CellStates.producer, -1, -1);
        this.addOrganism(org);
        FossilRecord.addSpecies(org, null);
    }

    addOrganism(organism) {
        organism.updateGrid();
        this.total_mutability += organism.mutability;
        this.organisms.push(organism);
        if (organism.anatomy.cells.length > this.largest_cell_count) 
            this.largest_cell_count = organism.anatomy.cells.length;
    }

    canAddOrganism() {
        return this.organisms.length < Hyperparams.maxOrganisms || Hyperparams.maxOrganisms < 0;
    }

    averageMutability() {
        if (this.organisms.length < 1)
            return 0;
        if (Hyperparams.useGlobalMutability) {
            return Hyperparams.globalMutability;
        }
        return this.total_mutability / this.organisms.length;
    }

    changeCell(c, r, state, owner) {
        super.changeCell(c, r, state, owner);
        this.renderer.addToRender(this.grid_map.cellAt(c, r));
        if(state == CellStates.wall)
            this.walls.push(this.grid_map.cellAt(c, r));
    }

    clearWalls() {
        for(var wall of this.walls){
            let wcell = this.grid_map.cellAt(wall.col, wall.row);
            if (wcell && wcell.state == CellStates.wall)
                this.changeCell(wall.col, wall.row, CellStates.empty, null);
        }
    }

    clearOrganisms() {
        for (var org of this.organisms)
            org.die();
        this.organisms = [];
    }
    
    clearDeadOrganisms() {
        let to_remove = [];
        for (let i in this.organisms) {
            let org = this.organisms[i];
            if (!org.living)
                to_remove.push(i);
        }
        this.removeOrganisms(to_remove);
    }

    generateFood() {
        var num_food = Math.max(Math.floor(this.grid_map.cols*this.grid_map.rows*Hyperparams.foodDropProb/50000), 1)
        var prob = Hyperparams.foodDropProb;
        for (var i=0; i<num_food; i++) {
            if (Math.random() <= prob){
                var c=Math.floor(Math.random() * this.grid_map.cols);
                var r=Math.floor(Math.random() * this.grid_map.rows);

                if (this.grid_map.cellAt(c, r).state == CellStates.empty){
                    this.changeCell(c, r, CellStates.food, null);
                }
            }
        }
    }

    reset(confirm_reset=true, reset_life=true) {
        if (confirm_reset && !confirm('The current environment will be lost. Proceed?'))
            return false;
        let restart = false;
        if (this.engine.running) {
            this.engine.last_fps = this.engine.fps;
            this.engine.stop();
            restart = true;
        }
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.largest_cell_count = 0;
        FossilRecord.clear_record();
        if (reset_life)
            this.OriginOfLife();
        if (restart)
            this.engine.start(this.engine.last_fps);
        return true;
    }

    resizeGridColRow(cell_size, cols, rows) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows*cell_size, cols*cell_size);
        this.grid_map.resize(cols, rows, cell_size);
    }

    resizeFillWindow(cell_size) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow('env');
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.resize(this.num_cols, this.num_rows, cell_size);
    }

    //-------------------GTZ
    paintTheftZone(col_start, row_start, col_end, row_end, on=true) {
        let count = 0;
        let c0 = Math.max(0, Math.min(col_start, col_end));
        let c1 = Math.min(this.grid_map.cols - 1, Math.max(col_start, col_end));
        let r0 = Math.max(0, Math.min(row_start, row_end));
        let r1 = Math.min(this.grid_map.rows - 1, Math.max(row_start, row_end));
        for (let c = c0; c <= c1; c++) {
            for (let r = r0; r <= r1; r++) {
                let cell = this.grid_map.cellAt(c, r);
                if (cell == null)
                    continue;
                cell.theft_zone = on;
                count++;
            }
        }
        this.renderer.renderFullGrid(this.grid_map.grid);
        return count;
    }

    clearTheftZone() {
        return this.paintTheftZone(0, 0, this.grid_map.cols - 1, this.grid_map.rows - 1, false);
    }

    // Where a body cell at (loc_col, loc_row) actually sits in the world once the
    // organism's rotation is applied. Mirrors BodyCell.rotatedCol / rotatedRow.
    localToReal(org, loc_col, loc_row) {
        switch (org.rotation) {
            case Directions.down:  return [org.c - loc_col, org.r - loc_row];
            case Directions.left:  return [org.c + loc_row, org.r - loc_col];
            case Directions.right: return [org.c - loc_row, org.r + loc_col];
            default:               return [org.c + loc_col, org.r + loc_row]; // up
        }
    }

    // One organism's turn. Returns true if its body changed.
    theftStep(org) {
        if (Math.random() > Hyperparams.theftChance)
            return false;

        // 1. which of my cells are standing inside the zone?
        let mine_in_zone = [];
        for (let cell of org.anatomy.cells) {
            let g = this.grid_map.cellAt(cell.getRealCol(), cell.getRealRow());
            if (g != null && g.theft_zone)
                mine_in_zone.push(cell);
        }
        if (mine_in_zone.length === 0)
            return false;

        // 2. collect EVERY cell of another living organism touching me inside the
        //    zone, then pick one at random. Taking the first match instead would
        //    always steal the same cell, because the scan order is fixed.
        let donors = [];
        for (let cell of mine_in_zone) {
            let c = cell.getRealCol();
            let r = cell.getRealRow();
            for (let loc of Neighbors.adjacent) {
                let g = this.grid_map.cellAt(c + loc[0], r + loc[1]);
                if (g == null || !g.theft_zone)
                    continue;
                if (g.owner == null || g.owner === org || !g.owner.living)
                    continue;
                donors.push(g);
            }
        }
        if (donors.length === 0)
            return false;
        let donor = donors[Math.floor(Math.random() * donors.length)];

        // 3. one random change to MY body, equal thirds so average size does not
        //    drift. The donor is only a template and is never altered here: it
        //    takes its own turn and rolls its own outcome.
        let target = org.anatomy.getRandomCell();
        let roll = Math.floor(Math.random() * 3);
        let changed = false;

        if (roll === 0) {                       // GAIN a copy of the donor's cell
            changed = this.theftGain(org, target, donor.state);
        }
        else if (roll === 1) {                  // REPLACE one of my own with it
            if (target.state !== donor.state) {
                org.anatomy.replaceCell(donor.state, target.loc_col, target.loc_row, false);
                changed = true;
            }
        }
        else {                                  // LOSE one of my own
            if (org.anatomy.cells.length > 1) { // same guard mutate() uses
                let g = this.grid_map.cellAt(target.getRealCol(), target.getRealRow());
                changed = org.anatomy.removeCell(target.loc_col, target.loc_row);
                // the square is no longer part of the body, so release it.
                // updateGrid() only writes the cells an organism still has, it
                // never clears the ones it has lost.
                if (changed && g != null && g.owner === org)
                    this.changeCell(g.col, g.row, CellStates.empty, null);
            }
        }

        if (changed) {
            org.anatomy.checkTypeChange();      // producer/mover/eye flags must be rebuilt
            org.updateGrid();
        }
        return changed;
    }

    // Grow one new cell, copied from the donor, beside one of my existing cells.
    theftGain(org, target, state) {
        let slots = Neighbors.all.slice();   // same 8 directions mutate() grows into
        for (let i = slots.length - 1; i > 0; i--) { // shuffle: no preferred growth direction
            let j = Math.floor(Math.random() * (i + 1));
            let t = slots[i]; slots[i] = slots[j]; slots[j] = t;
        }
        for (let loc of slots) {
            let lc = target.loc_col + loc[0];
            let lr = target.loc_row + loc[1];
            if (!org.anatomy.canAddCellAt(lc, lr))
                continue;
            let real = this.localToReal(org, lc, lr);
            let g = this.grid_map.cellAt(real[0], real[1]);
            // only grow into a free square. never overwrite another organism.
            if (g == null || (g.state !== CellStates.empty && g.state !== CellStates.food))
                continue;
            org.anatomy.addDefaultCell(state, lc, lr);
            return true;
        }
        return false;
    }


    serialize() {
        this.clearDeadOrganisms();
        let env = SerializeHelper.copyNonObjects(this);
        env.grid = this.grid_map.serialize();
        env.organisms = [];
        for (let org of this.organisms){
            env.organisms.push(org.serialize());
        }
        env.fossil_record = FossilRecord.serialize();
        env.controls = Hyperparams;
        return env;
    }

    loadRaw(env) { // species name->stats map, evolution controls, 
        this.organisms = [];
        FossilRecord.clear_record();
        let cell_size = env.grid.cell_size ? env.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, env.grid.cols, env.grid.rows)
        this.grid_map.loadRaw(env.grid);
        for (let wall of env.grid.walls) {
            this.walls.push(this.grid_map.cellAt(wall.c, wall.r));
        }

        // create species map
        let species = {};
        for (let name in env.fossil_record.species) {
            let s = new Species(null, null, 0);
            SerializeHelper.overwriteNonObjects(env.fossil_record.species[name], s)
            species[name] = s; // the species needs an anatomy obj still
        }

        for (let orgRaw of env.organisms) {
            let org = new Organism(orgRaw.col, orgRaw.row, this);
            org.loadRaw(orgRaw);
            this.addOrganism(org);
            let s = species[orgRaw.species_name];
            if (!s){ // ideally, every organisms species should exists, but there is a bug that misses some species sometimes
                s = new Species(org.anatomy, null, env.total_ticks);
                species[orgRaw.species_name] = s;
            }
            if (!s.anatomy) {
                //if the species doesn't have anatomy we need to initialize it
                s.anatomy = org.anatomy;
                s.calcAnatomyDetails();
            }
            s.name = orgRaw.species_name;
            org.species = s;
        }
        for (let name in species)
            FossilRecord.addSpeciesObj(species[name]);
        FossilRecord.loadRaw(env.fossil_record);
        SerializeHelper.overwriteNonObjects(env, this);
        if ($('#override-controls').is(':checked'))
            Hyperparams.loadJsonObj(env.controls)
        this.renderer.renderFullGrid(this.grid_map.grid);
    }
}

module.exports = WorldEnvironment;

