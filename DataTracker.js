class DataTracker {

    constructor() {
        this.data = {};
        this.limits = {};
    }

    addVariable(name, limit = Infinity) {
        this.data[name] = [];
        this.limits[name] = limit;
    }

    setLimit(name, limit) {
        this.limits[name] = limit;
    }

    push(name, value) {
        if (this.data[name]) {
            this.data[name].push(value);
            while (this.data[name].length > this.limits[name]) {
                this.data[name].shift();
            }
        }
    }

    getAverage(name) {
        if (this.data[name]) {
            const sum = this.data[name].reduce((a, b) => a + b, 0);
            return sum / this.data[name].length;
        }
    }
}

module.exports = DataTracker;

/*
const tracker = new DataTracker();
tracker.addVariable('temp', 5);  // Limit to the last 5 values
tracker.push('temp', 20);
tracker.push('temp', 22);
tracker.push('temp', 24);
tracker.push('temp', 26);
tracker.push('temp', 28);
tracker.push('temp', 30);  // This will remove the first value (20)
console.log(tracker.getAverage('temp'));  // 26
*/