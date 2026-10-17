const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Neighbors = require("../../../Grid/Neighbors");
const Directions = require("../../Directions");

// Tunable values. Keep them fixed across every run of an experiment.

// Chance, per tick, that a working cell touched by a toxin cell becomes impaired.
const TOXIN_CHANCE = 0.005;

// Lifespan (in ticks) a victim loses each time one of its cells is impaired.
const TOXIN_AGING = 20;

// Chance, per tick of contact, that a touched organism that is not yet toxic
// gains a toxin cell of its own (1 = every touch infects).
const INFECT_CHANCE = 0.1;

// Cell types a toxin can impair: sensing, feeding, movement and food production.
const IMPAIRABLE = [CellStates.eye, CellStates.mouth, CellStates.mover, CellStates.producer];

// Converts a real grid position into an organism's local cell coordinates
// (the reverse of BodyCell.rotatedCol / rotatedRow).
function toLocal(org, real_c, real_r) {
    var dc = real_c - org.c;
    var dr = real_r - org.r;
    switch (org.rotation) {
        case Directions.up:
            return [dc, dr];
        case Directions.down:
            return [-dc, -dr];
        case Directions.left:
            return [-dr, dc];
        case Directions.right:
            return [dr, -dc];
    }
}

function hasToxin(org) {
    for (var cell of org.anatomy.cells) {
        if (cell.state == CellStates.toxin)
            return true;
    }
    return false;
}

// Like a processionary caterpillar's hairs: harms whatever touches it, but not its own body.
// On contact it also passes a toxin cell to the touched organism, so the trait spreads.
class ToxinCell extends BodyCell {
    constructor(org, loc_col, loc_row) {
        super(CellStates.toxin, org, loc_col, loc_row);
    }

    performFunction() {
        var env = this.org.env;
        var c = this.getRealCol();
        var r = this.getRealRow();
        for (var loc of Neighbors.adjacent) {
            var cell = env.grid_map.cellAt(c + loc[0], r + loc[1]);
            this.touchNeighbor(cell, env);
        }
    }

    touchNeighbor(n_cell, env) {
        if (n_cell == null || n_cell.owner == null || n_cell.owner == this.org || !n_cell.owner.living)
            return;
        this.impairCell(n_cell, env);
        this.infect(n_cell, env);
    }

    // Switches off the touched cell (eye, mouth, mover or producer) and ages its owner.
    impairCell(n_cell, env) {
        var target = n_cell.cell_owner; // the specific body cell that was touched
        if (target == null || target.impaired || !IMPAIRABLE.includes(target.state))
            return;
        if (Math.random() < TOXIN_CHANCE) {
            target.impaired = true;
            target.org.lifetime += TOXIN_AGING; // poisoned organisms die sooner
            // queue the grid cell for redraw so the darker "impaired" look appears
            env.changeCell(n_cell.col, n_cell.row, n_cell.state, target);
        }
    }

    // Grows a new toxin cell on the touched organism, in an empty space next to the touched cell.
    // An organism is only infected once, and its offspring inherit the toxin cell.
    infect(n_cell, env) {
        var victim = n_cell.owner;
        if (hasToxin(victim))
            return;
        if (Math.random() >= INFECT_CHANCE)
            return;
        for (var loc of Neighbors.adjacent) {
            var gc = env.grid_map.cellAt(n_cell.col + loc[0], n_cell.row + loc[1]);
            if (gc == null || gc.state != CellStates.empty)
                continue; // the new cell needs empty space
            var local = toLocal(victim, gc.col, gc.row);
            if (!victim.anatomy.canAddCellAt(local[0], local[1]))
                continue;
            var new_cell = victim.anatomy.addDefaultCell(CellStates.toxin, local[0], local[1]);
            env.changeCell(gc.col, gc.row, CellStates.toxin, new_cell);
            return;
        }
    }
}

module.exports = ToxinCell;
