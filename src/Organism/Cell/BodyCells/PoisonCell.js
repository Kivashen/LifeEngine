const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class PoisonCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.poison, org, loc_col, loc_row);
        this.org.anatomy.is_poisonous = true
    }

    performFunction() {
        if (!this.org.anatomy.is_mover)
            return;
        var env = this.org.env;
        var prob = Hyperparams.foodProdProb;
        var real_c = this.getRealCol();
        var real_r = this.getRealRow();
        // if (Math.random() * 100 <= prob) {
            var loc = Hyperparams.growableNeighbors[Math.floor(Math.random() * Hyperparams.growableNeighbors.length)]
            var loc_c=loc[0];
            var loc_r=loc[1];
            var cell = env.grid_map.cellAt(real_c+loc_c, real_r+loc_r);
            if (cell != null && cell.state == CellStates.empty){
                env.changeCell(real_c+loc_c, real_r+loc_r, CellStates.slime, null);
                return;
            }
        // }
    }
}

module.exports = PoisonCell;