// initialize global variables and graph configuration
const graph_node_config_obj_default = {
    "default": {
        "shape": "box",
        "color": "#FFFFFF",
        "style": "filled",
        "border": 0,
        "cellborder": 0,
        "value": 20,
        "config_file": null,
        "font": {
            "multi": "html",
            "face": "courier",
            "size": 24,
            "bold": {
                "size": 36
            }
        },
        "margin": 10
    }
}
const graph_edge_config_obj_default = {
    "default": {
        config_file: null,
        font: {
            "multi": "html",
            "face": "courier",
            "size": 24
        },
    }
}

let prefixes_graph = {};
const stack_promises = [];
var store = new N3.Store();
const myEngine = new Comunica.QueryEngine();
const query_initial_graph = `CONSTRUCT {
    ?action a <http://schema.org/Action> ;
        <https://swissdatasciencecenter.github.io/renku-ontology#command> ?actionCommand .

    ?activity a ?activityType ;
        <http://www.w3.org/ns/prov#startedAtTime> ?activityTime ;
        <http://www.w3.org/ns/prov#hadPlan> ?action .
    }
    WHERE { 
        ?action a <http://schema.org/Action> ;
            <https://swissdatasciencecenter.github.io/renku-ontology#command> ?actionCommand .
             
        ?activity a ?activityType ;
            <http://www.w3.org/ns/prov#startedAtTime> ?activityTime ;
            <http://www.w3.org/ns/prov#hadPlan> ?action .
    }`

const parser = new N3.Parser({ format: 'ttl' });

function load_graph() {

    // load various configs, default if not provided
    var graph_json_files_paths = [];
    if ((typeof nodes_graph_config_obj === 'undefined' || nodes_graph_config_obj === undefined || nodes_graph_config_obj === null || $.isEmptyObject(nodes_graph_config_obj)) &&
        (typeof edges_graph_config_obj === 'undefined' || edges_graph_config_obj === undefined || edges_graph_config_obj === null || $.isEmptyObject(edges_graph_config_obj))) {
        nodes_graph_config_obj = {};
        edges_graph_config_obj = {};
        graph_json_files_paths.push(
            "graph_data/graph_graphical_config/graph_config.json",
            "graph_data/graph_graphical_config/graph_config_1.json");
    }

    if (typeof subset_nodes_config_obj === 'undefined' || subset_nodes_config_obj === undefined || subset_nodes_config_obj === null || $.isEmptyObject(subset_nodes_config_obj)) {
        subset_nodes_config_obj = {};
        graph_json_files_paths.push("graph_data/graph_nodes_subset/graph_nodes_subset_config.json");
    }

    if (typeof graph_reductions_obj === 'undefined' || graph_reductions_obj === undefined || graph_reductions_obj === null || $.isEmptyObject(graph_reductions_obj)) {
        graph_reductions_obj = {};
        graph_json_files_paths.push("graph_data/graph_reduction_config/graph_reduction_config.json");
    }

    if (graph_json_files_paths.length > 0) {
        var requests = graph_json_files_paths.map(function (path) {
            return $.getJSON(path);
        });

        $.when.apply($, requests).then((...args) => {
            for (var i = 0; i < args.length; i++) {
                let json_subfolder = graph_json_files_paths[i].split("/")[1];
                if (json_subfolder === "graph_graphical_config") {
                    if (args[i][0].hasOwnProperty("Nodes")) {
                        Object.values(args[i][0]["Nodes"]).forEach(val => {
                            val['config_file'] = graph_json_files_paths[i];
                        });
                        nodes_graph_config_obj = { ...nodes_graph_config_obj, ...args[i][0]["Nodes"] };
                    }
                    if (args[i][0].hasOwnProperty("Edges")) {
                        Object.values(args[i][0]["Edges"]).forEach(val => {
                            val['config_file'] = graph_json_files_paths[i];
                        });
                        edges_graph_config_obj = { ...edges_graph_config_obj, ...args[i][0]["Edges"] };
                    }
                    let div_checkbox = $('<div>').css("margin", '5px');
                    let label_checkbox = $('<label>').text(graph_json_files_paths[i]);
                    let input_checkbox = $('<input>')
                        .attr("id", "config_" + graph_json_files_paths[i])
                        .attr("value", graph_json_files_paths[i])
                        .attr("type", "checkbox")
                        .attr("checked", "")
                        .change(function () {
                            toggle_graph_config($(this)[0]);
                        });
                    label_checkbox.prepend(input_checkbox);
                    div_checkbox.append(label_checkbox);
                    document.getElementById('configs_checkboxes').append(div_checkbox[0]);
                }
                if (json_subfolder === "graph_nodes_subset") {
                    subset_nodes_config_obj = { ...subset_nodes_config_obj, ...args[i][0] };
                    for (const [key, value] of Object.entries(subset_nodes_config_obj)) {
                        let div_checkbox = $('<div>').css("margin", '5px');
                        let label_checkbox = $('<label>').text(value['description']);
                        let input_checkbox = $('<input>')
                            .attr("id", key + "_filter")
                            .attr("value", value['prefixes'])
                            .attr("type", "checkbox")
                            .attr("checked", "")
                            .change(function () {
                                enable_filter($(this)[0]);
                            });
                        label_checkbox.prepend(input_checkbox);
                        div_checkbox.append(label_checkbox);
                        document.getElementById('subset_node_checkboxes').append(div_checkbox[0]);
                    }
                }
                if (json_subfolder === "graph_reduction_config") {
                    graph_reductions_obj = { ...graph_reductions_obj, ...args[i][0] };
                    for (const [key, value] of Object.entries(graph_reductions_obj)) {
                        let div_checkbox = $('<div>').css("margin", '5px');
                        let label_checkbox = $('<label>').text(value['name']);
                        let input_checkbox = $('<input>')
                            .attr("id", "reduction_config_" + key)
                            .attr("value", key)
                            .attr("type", "checkbox")
                            .attr("unchecked", "")
                            .change(function () {
                                apply_reduction_change($(this)[0]);
                            });
                        label_checkbox.prepend(input_checkbox);
                        div_checkbox.append(label_checkbox);
                        document.getElementById('reduction_config_checkboxes').append(div_checkbox[0]);
                    }
                }
            }
            draw_graph();
        });
    } else {
        draw_graph();
    }
}

function draw_graph() {
    var container = document.getElementById('mynetwork');

    // parsing and collecting nodes and edges from the python
    nodes = new vis.DataSet([]);
    edges = new vis.DataSet([]);

    // adding nodes and edges to the graph
    data = { nodes: nodes, edges: edges };

    if (window.options === null || window.options === undefined || $.isEmptyObject(window.options))
        window.options = {
            autoResize: true,
            nodes: {
                scaling: {
                    min: 10,
                    max: 30
                },
                font: {
                    size: 14,
                    face: "Tahoma",
                },
            },
            edges: {
                smooth: false,
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 1.2
                    }
                },
                width: 4

            },
            layout: {
                hierarchical: {
                    enabled: false
                }
            },
            interaction: {

            },
        };

    network = new vis.Network(container, data, options);

    if (typeof graph_ttl_content !== 'undefined' && graph_ttl_content !== undefined && graph_ttl_content !== null && graph_ttl_content !== '')
        parse_and_query_ttl_graph();
    else
        parse_and_query_graph_example('graph_data/graph_two_commands.ttl');

    network.on("stabilized", function (e) {
        stop_animation();
    });

    network.on("dragStart", function (e) {
        stop_animation();
        if (e.nodes[0])
            fix_release_nodes(false, e.nodes[0]);
    });

    network.on("click", function (e) {
        if (e.nodes[0]) {
            if (nodes.get(e.nodes[0])['clickable']) {
                let clicked_node = nodes.get(e.nodes[0]);
                if (!('expanded' in clicked_node) || !clicked_node['expanded']) {
                    nodes.update({
                        id: clicked_node.id,
                        expanded: true
                    });
                    // fix all the current nodes
                    fix_release_nodes();
                    let checkbox_reduction;
                    apply_invisibility_new_nodes = false;
                    if (clicked_node.hasOwnProperty("type_name")) {
                        checkbox_reduction = document.getElementById('reduction_config_' + clicked_node.type_name);
                    }
                    apply_invisibility_new_nodes = true;
                    (async () => {
                        const bindingsStreamCall = await myEngine.queryQuads(
                            format_query_clicked_node(clicked_node.id),
                            {
                                sources: [store]
                            }
                        );
                        bindingsStreamCall.on('data', (binding) => {
                            process_binding(binding, clicked_node, apply_invisibility_new_nodes);
                        });
                        bindingsStreamCall.on('end', () => {
                            // enable/disable subsets of nodes selection from the graph
                            for (let prefix_idx in prefixes_graph) {
                                let checkbox_config = document.getElementById(prefix_idx + '_filter');
                                if (checkbox_config !== null && !checkbox_config.checked) {
                                    let values_input = checkbox_config.value.split(",");
                                    for (let value_input_idx in values_input) {
                                        let nodes_to_filter = nodes.get({
                                            filter: function (item) {
                                                return (item.prefix === prefixes_graph[values_input[value_input_idx].trim()]);
                                            }
                                        });
                                        // nodes.remove(nodes_to_filter);
                                        nodes_to_filter.forEach(node => {
                                            nodes.update({ id: node.id, hidden: true, filtered_out: true });
                                        });
                                    }
                                }
                            }
                            //
                            // apply layout
                            let checked_radiobox = document.querySelector('input[name="graph_layout"]:checked');
                            toggle_layout(checked_radiobox);
                            //
                            // apply reductions
                            if (checkbox_reduction !== undefined &&
                                checkbox_reduction !== null &&
                                clicked_node.type_name in graph_reductions_obj) {
                                let reduction_subset = graph_reductions_obj[clicked_node.type_name];
                                let predicates_to_absorb_list = reduction_subset["predicates_to_absorb"].split(",");
                                let origin_node_list = nodes.get({
                                    filter: function (item) {
                                        return (item.id === clicked_node.id);
                                    }
                                });
                                if (checkbox_reduction.checked) {
                                    absorb_nodes(origin_node_list, predicates_to_absorb_list);
                                }
                            }
                            //
                            // show any hidden nodes
                            const hidden_nodes_ids = nodes.get({
                                filter: function (item) {
                                    return (item.hasOwnProperty("hidden") && item.hidden === true && item.filtered_out === false);
                                }
                            });
                            hidden_nodes_ids.forEach(node => {
                                nodes.update({ id: node.id, hidden: false });
                            });
                            // remove edges that are not visible because one of the connected nodes has been removed
                            remove_unused_edges();
                        });
                        bindingsStreamCall.on('error', (error) => {
                            console.error(error);
                        });
                    })();
                }
                else {
                    let connected_to_nodes = network.getConnectedNodes(clicked_node.id);
                    let nodes_to_remove = [];
                    let edges_to_remove = [];
                    if (connected_to_nodes.length > 0) {
                        for (let i in connected_to_nodes) {
                            let connected_to_node = connected_to_nodes[i];
                            connected_to_connected_to_node = network.getConnectedNodes(connected_to_node);
                            if (connected_to_connected_to_node.length == 1) {
                                nodes_to_remove.push(connected_to_node);
                                edges_to_remove.push(...network.getConnectedEdges(connected_to_node));
                            }
                        }
                    }

                    let original_label = clicked_node.hasOwnProperty('original_label') ? clicked_node.original_label : clicked_node.label;
                    nodes.update({
                        id: clicked_node.id,
                        label: original_label,
                        child_nodes_list_content: [],
                        expanded: false
                    });

                    edges.remove(edges_to_remove);
                    nodes.remove(nodes_to_remove);
                }
            }
        }
    });

    var container_configure = document.getElementsByClassName("vis-configuration-wrapper");
    if (container_configure && container_configure.length > 0) {
        container_configure = container_configure[0];
        container_configure.style = {};
        container_configure.style.height = "300px";
        container_configure.style.overflow = "scroll";
    }

    // legend
    reset_legend();

    return network;
}

function parse_and_query_graph_example(graph_examples_path) {
    $.ajax({
        async: true,
        url: graph_examples_path,
        dataType: 'text',
        success: function (data) {
            parsed_graph = parser.parse(data,
                function (error, triple, prefixes) {
                    // Always log errors
                    if (error) {
                        console.error(error);
                    }
                    if (triple) {
                        store.addQuad(triple.subject, triple.predicate, triple.object);
                    } else {
                        prefixes_graph = prefixes;
                        (async () => {
                            const bindingsStreamCall = await myEngine.queryQuads(query_initial_graph,
                                {
                                    sources: [store]
                                }
                            );
                            bindingsStreamCall.on('data', (binding) => {
                                process_binding(binding);
                            });
                            bindingsStreamCall.on('end', () => {
                                let checked_radiobox = document.querySelector('input[name="graph_layout"]:checked');
                                toggle_layout(checked_radiobox);
                            });
                            bindingsStreamCall.on('error', (error) => {
                                console.error(error);
                            });
                        })();
                    }

                }
            );
        }
    });
}

function parse_and_query_ttl_graph() {
    parsed_graph = parser.parse(graph_ttl_content,
        function (error, triple, prefixes) {
            // Always log errors
            if (error) {
                console.error(error);
            }
            if (triple) {
                store.addQuad(triple.subject, triple.predicate, triple.object);
            } else {
                prefixes_graph = prefixes;
                (async () => {
                    const bindingsStreamCall = await myEngine.queryQuads(query_initial_graph,
                        {
                            sources: [store]
                        }
                    );
                    bindingsStreamCall.on('data', (binding) => {
                        process_binding(binding);
                    });
                    bindingsStreamCall.on('end', () => {
                        let checked_radiobox = document.querySelector('input[name="graph_layout"]:checked');
                        toggle_layout(checked_radiobox);
                    });
                    bindingsStreamCall.on('error', (error) => {
                        console.error(error);
                    });
                })();
            }

        }
    );
}

function fit_graph() {
    network.fit();
}

function enable_filter(check_box_element) {
    let values_input = check_box_element.value.split(",");
    for (let value_input_idx in values_input) {
        let nodes_to_filter = nodes.get({
            filter: function (item) {
                return (item.prefix === prefixes_graph[values_input[value_input_idx].trim()]);
            }
        });
        nodes_to_filter.forEach(node => {
            nodes.update({ id: node.id, hidden: !check_box_element.checked, filtered_out: !check_box_element.checked });
        });
    }
}

function toggle_layout(radio_box_element) {
    let layout_id = radio_box_element.id;
    let layout_name = layout_id.split("_")[0];
    apply_layout(layout_name);
}

function apply_layout(layout_name) {
    switch (layout_name) {
        case "hierarchical":
            network.setOptions(
                {
                    edges: {
                        smooth: false
                    },
                    layout: {
                        hierarchical: {
                            enabled: true,
                            levelSeparation: 300,
                            sortMethod: "directed",
                            nodeSpacing: 150
                        }
                    },
                    physics: {
                        enabled: true,
                        minVelocity: 0.75,
                        timestep: 0.35,
                        maxVelocity: 100,
                        solver: "hierarchicalRepulsion",
                        hierarchicalRepulsion: {
                            nodeDistance: 250,
                        },
                        stabilization: {
                            enabled: true,
                            updateInterval: 25,
                            iterations: 1000
                        },
                    }
                }
            );
            break;

        case "repulsion":
            network.setOptions(
                {
                    edges: {
                        smooth: false
                    },
                    layout: {
                        "hierarchical": {
                            "enabled": false
                        }
                    },
                    physics: {
                        enabled: true,
                        minVelocity: 0.75,
                        timestep: 0.35,
                        maxVelocity: 100,
                        solver: "repulsion",
                        repulsion: {
                            nodeDistance: 350,
                            centralGravity: 1.05,
                            springConstant: 0.05,
                            springLength: 250
                        },
                        stabilization: {
                            enabled: true,
                            updateInterval: 25,
                            iterations: 1000
                        },
                    }
                }
            );
            break;

        default:
            network.setOptions(options);
    }
}


function remove_unused_edges() {
    // remove edges that are not visible because one of the connected nodes has been removed
    let edges_to_remove = edges.get({
        filter: function (item) {
            return (nodes.get(item.from) === null || nodes.get(item.to) === null);
        }
    });
    edges.remove(edges_to_remove);
}

function reset_legend() {
    let span_config_list = document.querySelectorAll('[id^="span_"]');
    for (i = 0; i < span_config_list.length; i++) {
        span_config_list[i].remove();
    }

    let legend_container = document.getElementById('legend_container');
    for (let config in nodes_graph_config_obj) {
        let check_box_config = document.getElementById('config_' + nodes_graph_config_obj[config]['config_file']);
        if (check_box_config && check_box_config.checked) {

            let outer_li = document.createElement("li");
            outer_li.setAttribute("id", `span_${config}`);
            outer_li.setAttribute("style", "position: relative; margin: 5px; font-size: small;");

            let color_span = document.createElement("span");
            let color = nodes_graph_config_obj[config]['color'];
            color_span.setAttribute("style", `border-style: solid; border-width: 1px; width: 14px; height: 14px; display: inline-block; position: absolute; background-color: ${color};`);

            let name_span = document.createElement("span");
            name_span.setAttribute("style", "margin-left: 20px;");

            let legend_label = config;
            if (nodes_graph_config_obj[config].hasOwnProperty("displayed_type_name"))
                legend_label = nodes_graph_config_obj[config].displayed_type_name;

            name_span.innerText = legend_label;

            outer_li.appendChild(color_span);
            outer_li.appendChild(name_span);

            legend_container.append(outer_li);
        }
    }
}

function toggle_graph_config(check_box_element) {
    let checked_config_id = check_box_element.id;
    let edges_graph_config_obj_asArray = Object.entries(edges_graph_config_obj);
    let edge_config_subset = edges_graph_config_obj_asArray.filter(config => 'config_' + config[1].config_file === checked_config_id);
    if (check_box_element.checked) {
        let nodes_graph_config_obj_asArray = Object.entries(nodes_graph_config_obj);
        let node_config_subset = nodes_graph_config_obj_asArray.filter(config => 'config_' + config[1].config_file === checked_config_id);
        for (let config_idx in node_config_subset) {
            // let node_properties = node_config_subset[config_idx][1];
            let node_properties = { ...graph_node_config_obj_default['default'], ...node_config_subset[config_idx][1] };
            let nodes_to_update = nodes.get({
                filter: function (node) {
                    return (node.type_name === node_config_subset[config_idx][0]);
                }
            });
            // update_nodes(nodes_to_update, node_properties);
            for (let i in nodes_to_update) {
                node_to_update_id = nodes_to_update[i]['id'];
                nodes.update({
                    id: node_to_update_id,
                    color: node_properties['color'],
                    border: node_properties['color'],
                    cellborder: node_properties['color'],
                    shape: node_properties['shape'],
                    style: node_properties['style'],
                    value: node_properties['value'],
                    config_file: node_properties['config_file'],
                    label: nodes_to_update[i]['original_label']
                });
            }
        }
        for (let config_idx in edge_config_subset) {
            // let edge_properties = edge_config_subset[config_idx][1];
            let edge_properties = { ...graph_edge_config_obj_default['default'], ...edge_config_subset[config_idx][1] };
            // edge_properties['label'] = edge_properties.hasOwnProperty('displayed_type_name') ? edge_properties['displayed_type_name'] : literal_predicate;
            let edges_to_update = edges.get({
                filter: function (edge) {
                    return (edge.original_label === edge_config_subset[config_idx][0]);
                }
            });
            for (let i in edges_to_update) {
                edge_to_update_id = edges_to_update[i]['id'];
                let custom_label = edge_properties['displayed_type_name'];
                edges.update({
                    id: edge_to_update_id,
                    font: edge_properties['font'],
                    label: custom_label,
                    config_file: edge_properties['config_file']
                });
            }
        }
    } else {
        let nodes_to_update = nodes.get({
            filter: function (node) {
                return ('config_' + node.config_file === checked_config_id);
            }
        });
        let node_properties = graph_node_config_obj_default['default'];
        for (let i in nodes_to_update) {
            node_to_update_id = nodes_to_update[i]['id'];
            nodes.update({
                id: node_to_update_id,
                color: node_properties['color'],
                border: node_properties['color'],
                cellborder: node_properties['color'],
                shape: node_properties['shape'],
                style: node_properties['style'],
                value: node_properties['value'],
                config_file: node_properties['config_file'],
                label: nodes_to_update[i]['default_label']
            });
        }

        let edge_properties = graph_edge_config_obj_default['default'];
        let edges_to_update = edges.get({
            filter: function (edge) {
                return ('config_' + edge.config_file === checked_config_id);
            }
        });
        // update_edges(edges_to_update, edge_properties);
        for (let i in edges_to_update) {
            edge_to_update_id = edges_to_update[i]['id'];
            let original_label = edges_to_update[i]['original_label'];
            edges.update({
                id: edge_to_update_id,
                font: edge_properties['font'],
                label: original_label,
                config_file: edge_properties['config_file']
            });
        }

    }
    reset_legend();
}

function stop_animation() {
    if (network.physics.options.enabled)
        network.setOptions({ "physics": { enabled: false } });
}

function absorb_nodes(origin_node_list, predicates_to_absorb_list) {
    for (i in origin_node_list) {
        let origin_node = origin_node_list[i];
        let connected_edges = network.getConnectedEdges(origin_node.id);
        let new_label = origin_node.label;
        let child_nodes_list_content = []
        for (j in connected_edges) {
            let connected_edge = edges.get(connected_edges[j]);
            if (predicates_to_absorb_list.indexOf(connected_edge.title) > -1) {
                let edge_nodes = network.getConnectedNodes(connected_edges[j]);
                let node_removed = nodes.get(edge_nodes[1]);
                if (edge_nodes[0] == origin_node.id) {
                    let connected_edges_node_to_remove = network.getConnectedEdges(edge_nodes[1]);
                    if (connected_edges_node_to_remove.length == 1)
                        nodes.remove(edge_nodes[1]);
                }
                else {
                    node_removed = nodes.get(edge_nodes[0]);
                    let connected_edges_node_to_remove = network.getConnectedEdges(edge_nodes[0]);
                    if (connected_edges_node_to_remove.length == 1)
                        nodes.remove(edge_nodes[0]);
                }
                edges.remove(connected_edges[j]);
                if (origin_node.hasOwnProperty('child_nodes_list_content'))
                    child_nodes_list_content = origin_node.child_nodes_list_content;
                let node_removed_str = JSON.stringify(node_removed);
                let edge_removed_str = JSON.stringify(connected_edge);
                let matching_node_list_content = child_nodes_list_content.filter(function (el) {
                    return (el[0].indexOf('"id":"' + node_removed.id + '",') > -1 &&
                        el[1].indexOf('"id":"' + connected_edge.id + '",') > -1);
                });
                if (matching_node_list_content.length == 0) {
                    child_nodes_list_content.push([node_removed_str, edge_removed_str]);
                    let label_to_add = '\n' + node_removed.displayed_type_name + ': ' +
                        node_removed.label.replaceAll('\n', '')
                            .replaceAll(node_removed.displayed_type_name, '');
                    new_label += label_to_add;
                }
                origin_node = nodes.get(origin_node.id);
            }
        }
        nodes.update({
            id: origin_node.id,
            label: new_label,
            child_nodes_list_content: child_nodes_list_content
        });
    }
}

function apply_reduction_change(check_box_element) {
    let checked_reduction_id = check_box_element.id.replace("reduction_config_", "");

    if (checked_reduction_id in graph_reductions_obj) {
        let origin_node_list = nodes.get({
            filter: function (item) {
                return (item.hasOwnProperty("type_name") && item.type_name == checked_reduction_id);
            }
        });
        if (check_box_element.checked) {
            let reduction_subset = graph_reductions_obj[checked_reduction_id];
            let predicates_to_absorb_list = reduction_subset["predicates_to_absorb"].split(",");
            absorb_nodes(origin_node_list, predicates_to_absorb_list);
        } else {
            fix_release_nodes();
            for (i in origin_node_list) {
                // fix all the current nodes
                let origin_node = origin_node_list[i];
                if (origin_node.hasOwnProperty('child_nodes_list_content') &&
                    origin_node.child_nodes_list_content.length > 0) {
                    draw_child_nodes(origin_node);
                }
            }
            let checked_radiobox = document.querySelector('input[name="graph_layout"]:checked');
            toggle_layout(checked_radiobox);
        }
    }
}

function draw_child_nodes(origin_node) {
    let position_origin_node = network.getPosition(origin_node.id);
    for (j in origin_node.child_nodes_list_content) {
        let child_node_obj = JSON.parse(origin_node.child_nodes_list_content[j][0]);
        let edge_obj = JSON.parse(origin_node.child_nodes_list_content[j][1]);
        child_node_obj['x'] = position_origin_node.x;
        child_node_obj['y'] = position_origin_node.y;
        child_node_obj['hidden'] = false;
        if (!nodes.get(child_node_obj.id))
            nodes.add([child_node_obj]);
        if (!edges.get(edge_obj.id))
            edges.add([edge_obj]);
    }
    nodes.update({
        id: origin_node.id,
        label: origin_node.original_label,
        child_nodes_list_content: []
    });
}


function load_graph_example() {
    var loaded_graph_example = document.getElementById("graph_examples_selector").value;
    nodes.clear();
    edges.clear();
    store = new N3.Store();

    parse_and_query_graph_example(loaded_graph_example);
    reset_legend();
}

function reset_graph() {
    nodes.clear();
    edges.clear();

    (async () => {
        const bindingsStreamCall = await myEngine.queryQuads(query_initial_graph,
            {
                sources: [store]
            }
        );
        bindingsStreamCall.on('data', (binding) => {
            process_binding(binding);
        });
        bindingsStreamCall.on('end', () => {
            let checked_radiobox = document.querySelector('input[name="graph_layout"]:checked');
            toggle_layout(checked_radiobox);
        });
        bindingsStreamCall.on('error', (error) => {
            console.error(error);
        });
    })();

}

function extract_info_string(string_to_parse) {
    idx_slash = string_to_parse.lastIndexOf("/");
    substr_q = string_to_parse.slice(idx_slash + 1);
    if (substr_q) {
        idx_hash = substr_q.indexOf("#");
        if (idx_hash) {
            let type_name = substr_q.slice(idx_hash + 1);
            return [type_name, string_to_parse.replace(type_name, '')];
        }
    }
}

function query_type_node(node_id) {
    let type;
    let query = `SELECT ?type WHERE { <${node_id}> a ?type }`;
    return myEngine.queryBindings(
        query,
        {
            sources: [store]
        }
    );
}


function format_query_clicked_node(clicked_node_id) {

    let query = `CONSTRUCT {
            ?s ?p <${clicked_node_id}> ;
                a ?s_type ;
                ?p_literal ?s_literal .
            
            <${clicked_node_id}> ?p ?o .
            ?o a ?o_type . 
            ?o ?p_literal ?o_literal .
        
            ?action a <http://schema.org/Action> ;
                <https://swissdatasciencecenter.github.io/renku-ontology#command> ?actionCommand .
    
            ?activity a ?activityType ;
                <http://www.w3.org/ns/prov#startedAtTime> ?activityTime ;
                <http://www.w3.org/ns/prov#hadPlan> ?action .
        }
        WHERE {
            {
                ?s ?p <${clicked_node_id}> .
                ?s a ?s_type .
                ?s ?p_literal ?s_literal .
                FILTER isLiteral(?s_literal) .
                
                FILTER ( ?p != <http://www.w3.org/ns/prov#hadPlan> ) .
            }
            UNION
            {
                ?s ?p <${clicked_node_id}> .
                ?s a ?s_type .
                
                FILTER ( ?p != <http://www.w3.org/ns/prov#hadPlan> ) .
            }
            UNION
            {
                ?s ?p <${clicked_node_id}> .
                
                FILTER ( ?p != <http://www.w3.org/ns/prov#hadPlan> ) .
            }
            UNION
            {
                <${clicked_node_id}> ?p ?o .
                ?o a ?o_type .
                ?o ?p_literal ?o_literal .
                FILTER isLiteral(?o_literal) .
            
                FILTER ( ?p != <http://www.w3.org/ns/prov#hadPlan> ) .                    
            }
            UNION
            {
                <${clicked_node_id}> ?p ?o .
                ?o a ?o_type

                FILTER ( ?p != <http://www.w3.org/ns/prov#hadPlan> ) .
            }
            UNION
            {
                <${clicked_node_id}> ?p ?o .
                
                FILTER ( ?p != <http://www.w3.org/ns/prov#hadPlan> ) .
            }
            UNION
            {
                ?action a <http://schema.org/Action> ;
                    <https://swissdatasciencecenter.github.io/renku-ontology#command> ?actionCommand .
                     
                ?activity a ?activityType ;
                    <http://www.w3.org/ns/prov#startedAtTime> ?activityTime ;
                    <http://www.w3.org/ns/prov#hadPlan> ?action .
                
                FILTER (?activity = <${clicked_node_id}> ||
                        ?action = <${clicked_node_id}> ) .
                
            }
        }`;

    return query
}

function fix_release_nodes(fix, node_id) {
    if (fix === undefined)
        fix = true;
    if (node_id === undefined)
        nodes.forEach(node => {
            nodes.update({ id: node.id, fixed: fix });
        });
    else
        nodes.update({ id: node_id, fixed: fix });
}

function process_binding(binding, clicked_node, apply_invisibility_new_nodes) {
    if (apply_invisibility_new_nodes === undefined || apply_invisibility_new_nodes === null)
        apply_invisibility_new_nodes = false;

    let subj_id = binding.subject.id ? binding.subject.id : binding.subject.value;
    let obj_id = binding.object.id ? binding.object.id : binding.object.value;
    let edge_id = subj_id + "_" + obj_id;

    subj_node = {
        id: subj_id,
        label: binding.subject.value ? binding.subject.value : binding.subject.id,
        original_label: binding.subject.value ? binding.subject.value : binding.subject.id,
        title: subj_id,
        clickable: true,
        filtered_out: false,
        color: graph_node_config_obj_default['default']['color'],
        shape: graph_node_config_obj_default['default']['shape'],
        style: graph_node_config_obj_default['default']['style'],
        border: graph_node_config_obj_default['default']['border'],
        cellborder: graph_node_config_obj_default['default']['cellborder'],
        value: graph_node_config_obj_default['default']['value'],
        level: graph_node_config_obj_default['default']['level'],
        config_file: graph_node_config_obj_default['default']['config_file'],
        margin: graph_node_config_obj_default['default']['margin'],
        hidden: apply_invisibility_new_nodes,
        font: {
            'multi': "html",
            'face': "courier",
        }
    }
    edge_obj = {
        id: edge_id,
        from: subj_id,
        to: obj_id,
        config_file: graph_edge_config_obj_default['default']['config_file'],
        title: binding.predicate.value
    }
    obj_node = {
        id: obj_id,
        label: binding.object.value ? binding.object.value : binding.object.id,
        original_label: binding.object.value ? binding.object.value : binding.object.id,
        title: obj_id,
        clickable: true,
        filtered_out: false,
        color: graph_node_config_obj_default['default']['color'],
        shape: graph_node_config_obj_default['default']['shape'],
        style: graph_node_config_obj_default['default']['style'],
        border: graph_node_config_obj_default['default']['border'],
        cellborder: graph_node_config_obj_default['default']['cellborder'],
        value: graph_node_config_obj_default['default']['value'],
        config_file: graph_node_config_obj_default['default']['config_file'],
        level: graph_node_config_obj_default['default']['level'],
        margin: graph_node_config_obj_default['default']['margin'],
        hidden: apply_invisibility_new_nodes,
        font: {
            'multi': "html",
            'face': "courier",
        }
    }

    if (clicked_node !== undefined) {
        let position_clicked_node = network.getPosition(clicked_node.id);

        subj_node['x'] = position_clicked_node.x;
        subj_node['y'] = position_clicked_node.y;

        obj_node['x'] = position_clicked_node.x;
        obj_node['y'] = position_clicked_node.y;
    }

    if (!nodes.get(subj_id))
        nodes.add([subj_node]);

    if (binding.predicate.value.endsWith('#type')) {
        // extract type name
        let info_obj = extract_info_string(obj_id);;
        let type_name = info_obj[0];
        let prefix = info_obj[1];
        let subj_node_to_update = nodes.get(subj_id);
        // check type_name property of the node ahs already been defined previously
        if (subj_node_to_update !== null && !('type_name' in subj_node_to_update)) {
            let node_properties = { ...graph_node_config_obj_default['default'], ... (nodes_graph_config_obj[type_name] ? nodes_graph_config_obj[type_name] : graph_node_config_obj_default['default']) };
            // displayed_literals_format:defaultValue:yes/defaultValue:no
            // displayed_information:title/literals/both
            if ('displayed_information' in node_properties) {
                switch (node_properties['displayed_information']) {
                    case 'title':
                    case 'both':
                        if ('displayed_type_name' in node_properties)
                            subj_node_to_update['label'] = `<b>${node_properties['displayed_type_name']}</b>\n`;
                        else
                            subj_node_to_update['label'] = `<b>${type_name}</b>\n`;
                        break;
                    case 'literals':
                        subj_node_to_update['label'] = '';
                        break;
                }

                if ('displayed_type_name' in node_properties)
                    subj_node_to_update['title'] = node_properties['displayed_type_name'];
                else
                    subj_node_to_update['title'] = type_name;
            } else {
                if ('displayed_type_name' in node_properties) {
                    subj_node_to_update['label'] = `<b>${node_properties['displayed_type_name']}</b>\n`;
                    subj_node_to_update['title'] = node_properties['displayed_type_name'];
                }
                else {
                    subj_node_to_update['label'] = subj_node_to_update['title'] = `<b>${type_name}</b>\n`;
                    subj_node_to_update['title'] = type_name;
                }
            }
            let config_value = node_properties['config_file'];
            let checkbox_config = document.getElementById('config_' + config_value);
            if (checkbox_config && !checkbox_config.checked) {
                node_properties = graph_node_config_obj_default['default'];
                subj_node_to_update['label'] = type_name;
            }
            nodes.update({
                id: subj_id,
                label: subj_node_to_update['label'],
                default_label: type_name,
                original_label: subj_node_to_update['label'],
                title: subj_node_to_update['title'],
                type_name: type_name,
                prefix: prefix,
                displayed_type_name: node_properties['displayed_type_name'] ? node_properties['displayed_type_name'] : type_name,
                color: node_properties['color'],
                border: node_properties['color'],
                cellborder: node_properties['color'],
                shape: node_properties['shape'],
                style: node_properties['style'],
                value: node_properties['value'],
                config_file: node_properties['config_file'],
                font: node_properties['font']
            });
        }
    }
    else {
        //
        let literal_predicate_index = edge_obj['title'].lastIndexOf("/");
        let literal_predicate = edge_obj['title'].slice(literal_predicate_index + 1);
        if (literal_predicate) {
            idx_hash = literal_predicate.indexOf("#");
            if (idx_hash)
                literal_predicate = literal_predicate.slice(idx_hash + 1);
        }
        if (literal_predicate) {
            edge_obj['prefix'] = edge_obj['title'].replace(literal_predicate, '');
            edge_obj['title'] = literal_predicate;
        }
        if (!edges.get(edge_id)) {

            let edge_properties = { ...graph_edge_config_obj_default['default'], ... (edges_graph_config_obj[edge_obj['title']] ? edges_graph_config_obj[edge_obj['title']] : graph_edge_config_obj_default['default']) };
            edge_obj['original_label'] = literal_predicate;
            edge_obj['label'] = edge_properties.hasOwnProperty('displayed_type_name') ? edge_properties['displayed_type_name'] : literal_predicate;
            edge_obj['font'] = edge_properties['font'];
            edge_obj['config_file'] = edge_properties['config_file'];

            edges.add([edge_obj]);
        }
        if (!nodes.get(obj_id)) {
            if (binding.object.termType === "Literal") {
                subj_node_to_update = nodes.get(subj_id);
                if (subj_node_to_update !== null) {
                    literal_predicate_index = edge_obj['title'].lastIndexOf("/");
                    literal_predicate = edge_obj['title'].slice(literal_predicate_index + 1);
                    if (literal_predicate) {
                        idx_hash = literal_predicate.indexOf("#");
                        if (idx_hash)
                            literal_predicate = literal_predicate.slice(idx_hash + 1);
                    }

                    let literal_label = '';

                    if (subj_node_to_update !== null && 'type_name' in subj_node_to_update) {
                        let type_name = subj_node_to_update['type_name']
                        let node_properties = { ...graph_node_config_obj_default['default'], ... (nodes_graph_config_obj[type_name] ? nodes_graph_config_obj[type_name] : graph_node_config_obj_default['default']) };
                        // displayed_literals_format:defaultValue:yes / defaultValue:no
                        // displayed_information:title / literals / both
                        if ('literals_keyword_to_substitute' in node_properties) {
                            let literals_keyword_to_substitute = node_properties['literals_keyword_to_substitute'].split(";");
                            for (let i in literals_keyword_to_substitute) {
                                let literal_for_substitution = literals_keyword_to_substitute[i].split(":");
                                if (literal_for_substitution[0] === literal_predicate) {
                                    let keywords_substitution_list = literal_for_substitution[1].split(",");
                                    for (let j in keywords_substitution_list) {
                                        let keyword = keywords_substitution_list[j];
                                        if (obj_node['label'].indexOf(keyword) > -1) {
                                            obj_node['label'] = keyword;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        if ('displayed_information' in node_properties && node_properties['displayed_information'] !== "title" &&
                            'displayed_literals_format' in node_properties) {
                            if (node_properties['displayed_literals_format'].indexOf(`${literal_predicate}:`) > -1) {
                                let literals_display_config = node_properties['displayed_literals_format'].split(",");
                                for (let i in literals_display_config) {
                                    let literal_config = literals_display_config[i].split(":");
                                    if (literal_config[0] === literal_predicate) {
                                        switch (literal_config[1]) {
                                            case "yes":
                                                literal_label = literal_predicate + ': ' + obj_node['label'];
                                                break;
                                            case "no":
                                                literal_label = obj_node['label'];
                                                break;
                                            default:
                                                literal_label = literal_predicate + ': ' + obj_node['label'];
                                                break;
                                        }
                                    }
                                }
                            }
                        } else if (!('displayed_information' in node_properties)) {
                            literal_label = literal_predicate + ': ' + obj_node['label'];
                        }
                    } else {
                        literal_label = literal_predicate + ': ' + obj_node['label'];
                    }
                    if (literal_label !== '' && subj_node_to_update['label'].indexOf(literal_label) === -1) {
                        if (subj_node_to_update['label']) {
                            literal_label = "\n" + literal_label;
                        }
                        nodes.update({
                            id: subj_id,
                            label: subj_node_to_update['label'] + literal_label,
                            original_label: subj_node_to_update['label'] + literal_label,
                        });
                    }
                }
            }
            else
                nodes.add([obj_node]);
        }
    }
}

