const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

// An animal (no producer cells) carrying a toxin cell is immune to killer cells.
function isToxicAnimal(org) {
    if (org.anatomy.is_producer)
        return false;
    for (var cell of org.anatomy.cells) {
        if (cell.state == CellStates.toxin)
            return true;
    }
    return false;
}

class KillerCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.killer, org, loc_col, loc_row);
    }

    performFunction() {
        var env = this.org.env;
        var c = this.getRealCol();
        var r = this.getRealRow();
        for (var loc of Hyperparams.killableNeighbors) {
            var cell = env.grid_map.cellAt(c+loc[0], r+loc[1]);
            this.killNeighbor(cell);
        }
    }

    killNeighbor(n_cell) {
        if(n_cell == null || n_cell.owner == null || n_cell.owner == this.org || !n_cell.owner.living || n_cell.state == CellStates.armor) 
            return;
        //-------------------GTZ
        // killers do no damage inside the zone. A killer standing in the zone is disarmed, and anything standing in the zone is protected.
        if (Hyperparams.theftTruce) {
            var my_cell = this.getRealCell();
            if ((my_cell != null && my_cell.theft_zone) || n_cell.theft_zone)
                return;
        }
        //--------------------
        if (Hyperparams.dontKillSameSpecies && n_cell.owner.species.name === this.org.species.name)
            return;
        if (isToxicAnimal(n_cell.owner))
            return; // toxic animals are immune to killer cells
        var is_hit = n_cell.state == CellStates.killer; // has to be calculated before death
        n_cell.owner.harm();
        if (Hyperparams.instaKill && is_hit) {
            this.org.harm();
        }
    }
}

module.exports = KillerCell;
