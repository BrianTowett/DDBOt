const modules = {};

function browserRequire(id) {
    if (modules[id]) return modules[id];
    throw new Error('Cannot require "' + id + '" in browser environment');
}

browserRequire.resolve = function (id) {
    return id;
};

browserRequire.cache = modules;

export default browserRequire;
