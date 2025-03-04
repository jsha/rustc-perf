const commonCacheStateColors = {
    "full": "#7cb5ec",
    "incr-full": "#434348",
    "incr-unchanged": "#90ed7d",
    "incr-patched: println": "#f7a35c",
};

const otherCacheStateColors = ["#8085e9", "#f15c80", "#e4d354", "#2b908f", "#f45b5b", "#91e8e1"];
const interpolatedColor = "#fcb0f1";
const profiles = ["Check", "Debug", "Opt", "Doc"];

function tooltipPlugin({onclick, commits, isInterpolated, absoluteMode, shiftX = 10, shiftY = 10}) {
    let tooltipLeftOffset = 0;
    let tooltipTopOffset = 0;

    const tooltip = document.createElement("div");
    tooltip.className = "u-tooltip";

    let seriesIdx = null;
    let dataIdx = null;

    const fmtDate = uPlot.fmtDate("{M}/{D}/{YY} {h}:{mm}:{ss} {AA}");

    let over;

    let tooltipVisible = false;

    function showTooltip() {
        if (!tooltipVisible) {
            tooltip.style.display = "block";
            over.style.cursor = "pointer";
            tooltipVisible = true;
        }
    }

    function hideTooltip() {
        if (tooltipVisible) {
            tooltip.style.display = "none";
            over.style.cursor = null;
            tooltipVisible = false;
        }
    }

    function setTooltip(u) {
        showTooltip();

        let top = u.valToPos(u.data[seriesIdx][dataIdx], 'y');
        let lft = u.valToPos(u.data[0][dataIdx], 'x');

        tooltip.style.top = (tooltipTopOffset + top + shiftX) + "px";
        tooltip.style.left = (tooltipLeftOffset + lft + shiftY) + "px";

        tooltip.style.borderColor = isInterpolated(dataIdx) ?
            interpolatedColor :
            u.series[seriesIdx].stroke;

        let trailer = "";
        if (absoluteMode) {
            let pctSinceStart = (((u.data[seriesIdx][dataIdx] - u.data[seriesIdx][0]) / u.data[seriesIdx][0]) * 100).toFixed(2);
            trailer = uPlot.fmtNum(u.data[seriesIdx][dataIdx]) + " (" +
                pctSinceStart + "% since start)";
        } else {
            trailer = uPlot.fmtNum(u.data[seriesIdx][dataIdx]) + "% since start";
        }
        tooltip.textContent = (
            fmtDate(new Date(u.data[0][dataIdx] * 1e3)) + " - " +
            commits[dataIdx][1].slice(0, 10) + "\n" + trailer
        );
    }

    return {
        hooks: {
            ready: [
                u => {
                    over = u.root.querySelector(".u-over");

                    tooltipLeftOffset = parseFloat(over.style.left);
                    tooltipTopOffset = parseFloat(over.style.top);
                    u.root.querySelector(".u-wrap").appendChild(tooltip);

                    let clientX;
                    let clientY;

                    over.addEventListener("mousedown", e => {
                        clientX = e.clientX;
                        clientY = e.clientY;
                    });

                    over.addEventListener("mouseup", e => {
                        // clicked in-place
                        if (e.clientX == clientX && e.clientY == clientY) {
                            if (seriesIdx != null && dataIdx != null) {
                                onclick(u, seriesIdx, dataIdx);
                            }
                        }
                    });
                }
            ],
            setCursor: [
                u => {
                    let c = u.cursor;

                    if (dataIdx != c.idx) {
                        dataIdx = c.idx;

                        if (seriesIdx != null)
                            setTooltip(u);
                    }
                }
            ],
            setSeries: [
                (u, sidx) => {
                    if (seriesIdx != sidx) {
                        seriesIdx = sidx;

                        if (sidx == null)
                            hideTooltip();
                        else if (dataIdx != null)
                            setTooltip(u);
                    }
                }
            ],
        }
    };
}

function genPlotOpts({
                         title, width, height, yAxisLabel, series, commits,
                         stat, isInterpolated, alpha = 0.3, prox = 5, absoluteMode
                     }) {
    return {
        title,
        width,
        height,
        series,
        legend: {
            live: false,
        },
        focus: {
            alpha,
        },
        cursor: {
            focus: {
                prox,
            },
            drag: {
                x: true,
                y: true,
            },
        },
        scales: {
            y: {
                range: (self, dataMin, dataMax) => uPlot.rangeNum(absoluteMode ? 0 : dataMin, dataMax, 0.2, true)
            }
        },
        axes: [
            {
                grid: {
                    show: false,
                }
            },
            {
                label: yAxisLabel,
                space: 24,
                values: (self, splits) => {
                    return splits.map(v => {
                        return (
                            v >= 1e12 ? v / 1e12 + "T" :
                                v >= 1e9 ? v / 1e9 + "G" :
                                    v >= 1e6 ? v / 1e6 + "M" :
                                        v >= 1e3 ? v / 1e3 + "k" :
                                            v
                        );
                    });
                },
            },
        ],
        plugins: [
            {
                hooks: {
                    drawAxes: [
                        u => {
                            let {ctx} = u;
                            let {left, top, width, height} = u.bbox;

                            const interpolatedColorWithAlpha = "#fcb0f15f";

                            ctx.strokeStyle = interpolatedColorWithAlpha;
                            ctx.beginPath();

                            let [i0, i1] = u.series[0].idxs;

                            for (let j = i0; j <= i1; j++) {
                                let v = u.data[0][j];

                                if (isInterpolated(j)) {
                                    let cx = Math.round(u.valToPos(v, 'x', true));
                                    ctx.moveTo(cx, top);
                                    ctx.lineTo(cx, top + height);
                                }
                            }

                            ctx.closePath();
                            ctx.stroke();
                        },
                    ]
                },
            },
            tooltipPlugin({
                onclick(u, seriesIdx, dataIdx) {
                    let thisCommit = commits[dataIdx][1];
                    let prevCommit = (commits[dataIdx - 1] || [null, null])[1];
                    window.open(`/compare.html?start=${prevCommit}&end=${thisCommit}&stat=${stat}`);
                },
                commits,
                isInterpolated,
                absoluteMode,
            }),
        ],
    };
}

function renderPlots(data, state) {
    for (let benchName in data.benchmarks) {
        let benchKinds = data.benchmarks[benchName];

        let i = 0;

        for (let benchKind in benchKinds) {
            let cacheStates = benchKinds[benchKind];
            let cacheStateNames = Object.keys(cacheStates);
            cacheStateNames.sort();

            let yAxis = state.stat;
            let yAxisUnit = null;
            if (state.stat == "instructions:u") {
                yAxis = "CPU instructions";
                yAxisUnit = "count";
            } else if (state.stat == "cycles:u") {
                yAxis = "CPU cycles";
                yAxisUnit = "count";
            } else if (state.stat == "cpu-clock") {
                yAxis = "CPU clock";
                yAxisUnit = "seconds";
            } else if (state.stat == "task-clock") {
                yAxis = "Task clock";
                yAxisUnit = "seconds";
            } else if (state.stat == "wall-time") {
                yAxis = "Wall time";
                yAxisUnit = "seconds";
            } else if (state.stat == "max-rss") {
                yAxis = "Maximum resident set size";
                yAxisUnit = "kB";
            } else if (state.stat == "faults") {
                yAxis = "Faults";
                yAxisUnit = "count";
            }

            if (state.kind == "raw" && benchName == "Summary") {
                yAxisUnit = "relative";
            } else if (state.kind == "percentfromfirst") {
                yAxisUnit = "% change from first";
            } else if (state.kind == "percentrelative") {
                yAxisUnit = "% change from previous";
            }

            yAxis = yAxisUnit ? `${yAxis} (${yAxisUnit})` : yAxis;
            let yAxisLabel = i == 0 ? yAxis : null;

            let seriesOpts = [{}];

            let xVals = data.commits.map(c => c[0]);

            let plotData = [xVals];

            let otherColorIdx = 0;

            for (let cacheState of cacheStateNames) {
                let yVals = cacheStates[cacheState].points;
                let color = commonCacheStateColors[cacheState] || otherCacheStateColors[otherColorIdx++];

                plotData.push(yVals);

                seriesOpts.push({
                    label: cacheState,
                    width: devicePixelRatio,
                    stroke: color
                });
            }

            let indices = cacheStates[Object.keys(cacheStates)[0]].interpolated_indices;

            let plotOpts = genPlotOpts({
                title: benchName + "-" + benchKind,
                width: Math.floor(window.innerWidth / 4) - 40,
                height: 300,
                yAxisLabel,
                series: seriesOpts,
                commits: data.commits,
                stat: state.stat,
                isInterpolated(dataIdx) {
                    return indices.has(dataIdx);
                },
                absoluteMode: state.kind == "raw",
            });

            let u = new uPlot(plotOpts, plotData,
                document.querySelector("#charts"));

            i++;
        }
    }
    document.querySelector("#loading").style.display = 'none';
}

function get_json(path, query) {
    let q = Object.entries(query).map(e => `${e[0]}=${e[1]}`).join("&");
    return fetch(BASE_URL + path + "?" + q).then(r => r.json());
}

function prepData(data) {
    let sortedBenchNames = Object.keys(data.benchmarks).sort();

    let benchmarks = {};

    function optInterpolated(profile) {
        for (let scenario in profile)
            profile[scenario].interpolated_indices = new Set(profile[scenario].interpolated_indices);

        return profile;
    }

    sortedBenchNames.forEach(name => {
        benchmarks[name] = {};

        for (let profile of profiles) {
            if (data.benchmarks[name].hasOwnProperty(profile)) {
                benchmarks[name][profile.toLowerCase()] = optInterpolated(data.benchmarks[name][profile]);
            }
        }
    });

    data.benchmarks = benchmarks;

    return data;
}

function submit_settings() {
    let start = document.getElementById("start-bound").value;
    let end = document.getElementById("end-bound").value;
    let params = new URLSearchParams(window.location.search);
    params.set("start", start);
    params.set("end", end);
    params.set("kind", getSelected("kind"));
    params.set("stat", getSelected("stats"));
    window.location.search = params.toString();
}

loadState(state => {
    let values = Object.assign({}, {
        start: "",
        end: "",
        stat: "instructions:u",
        kind: "raw",
    }, state);
    get_json("/graphs", values).then(prepData).then(data =>
        renderPlots(data, values));
});
