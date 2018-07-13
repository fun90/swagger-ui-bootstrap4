function getData(operationId, method) {
    var path = $('#apiPath').val();
    //path 参数
    $('[operationId="' + operationId + '"][in="path"]').each(function (index, domEle) {
        var k = $(domEle).attr('name');
        var v = $(domEle).val();
        if (v) {
            path = path.replace('{' + k + '}', v);
        }
    });

    //header参数
    var headers = {};
    $('[operationId="' + operationId + '"][in="header"]').each(function (index, domEle) {
        var k = $(domEle).attr('name');
        var v = $(domEle).val();
        if (v) {
            headers[k] = v;
        }
    });
    headers['Content-Type'] = $('#consumeContentType').val() || 'text/plain';

    var paramBody = $('#paramBody');
    //query 参数
    var parameterJson = {};
    paramBody.find('[parameter="true"][in="query"]').each(function (index, domEle) {
        var k = $(domEle).attr('name');
        var v = $(domEle).val();
        if (v) {
            parameterJson[k] = v;
        }
    });

    var body = false;
    paramBody.find('[parameter="true"][in="body"]').each(function (index, domEle) {
        body = $(domEle).val();
    });

    //发送请求
    $.ajax({
        type: method,
        url: path,
        headers: headers,
        data: body || parameterJson,
        dataType: 'json',
        success: function (data) {
            $('#json-response-container').show();
            $('#json-response').jsonViewer(data);
        }
    });
}


(function ($) {
    function getResponseModelName(val) {
        if (!val) {
            return null;
        }
        return val.substring(val.lastIndexOf("/") + 1, val.length);
    }
    $.views.settings.allowCode(true);
    $.views.converters('getResponseModelName', function (val) {
        return getResponseModelName(val);
    });
    $.views.tags('jsonViewer', {
        render: function (value) {
            return $('<div></div>').jsonViewer(value).html();
        }
    });
    $.views.tags('getSampleJson', {
        render: function (apidocs, schema) {
            return JSON.stringify(getSampleObj(apidocs, schema), null, 4);
        }
    });

    var groupTemplate = $.templates('#groupTemplate');
    var menuTemplate = $.templates('#menuTemplate');
    var apiInfoTemplate = $.templates('#apiInfoTemplate');
    var apiTemplate = $.templates('#apiTemplate');

    $.ajax({
        url: '/swagger-resources',
        type: 'post',
        success: function (data) {
            //获取分组名称
            var groupData = data;
            $('#group').html(groupTemplate.render({groups: groupData}));
            $('#groupSel').on('change', function () {
                var that = $(this);
                var apiurl = that.find('option:selected').attr('data-url');
                loadApiInfo(apiurl);
            });
            var url = groupData[0].location;
            //默认加载第一个url
            loadApiInfo(url);
        }
    });

    // var openApiSpec;
    function loadApiInfo(url) {
        $.ajax({
            //url:'v2/api-docs',
            url: url,
            dataType: 'json',
            type: 'post',
            success: function (apidocs) {
                renderDescription(apidocs);
                renderMenu(apidocs);
                // openApiSpec  = apidocs;
            }
        })
    }

    function renderDescription(apidocs) {
        $('title').html('').html(apidocs.info.title);
        $('#content').html(apiInfoTemplate.render(apidocs));
    }

    var menu = $('#menu');
    function renderMenu(apidocs) {
        menu.html(menuTemplate.render(apidocs));
        $('.page-wrapper').css({'min-height': $(window).height() - 120});
        $('.menuLi').click(function () {
            menu.find('li').removeClass('active');
            $(this).addClass('active');
            var path = $(this).attr('path');
            var method = $(this).attr('method');
            var operationId = $(this).attr('operationId');
            $.each(apidocs.paths[path], function (i, d) {
                if (d.operationId === operationId) {
                    d.path = path;
                    d.method = method;
                    var schema = d.responses['200']['schema'];
                    var modelName = getResponseModelName(schema['$ref']);
                    if (modelName) {
                        if (!d.responseProperties) {
                            var props = apidocs.definitions[modelName]['properties'];
                            d.responseProperties = getTree(props, apidocs.definitions);
                        }
                        if (!d.sample) {
                            var sampleObj = getSampleObj(apidocs, schema);
                            d.sample = sampleObj;
                        }
                    }
                    if (!d.requestParameters) {
                        d.requestParameters = getTree(d.parameters, apidocs.definitions);
                    }
                    $('#content').html(apiTemplate.render({apidocs: apidocs, current: d}));
                    $('#responseModelTable, #requestModelTable').treegrid({
                        expanderExpandedClass: 'glyphicon glyphicon-minus',
                        expanderCollapsedClass: 'glyphicon glyphicon-plus'
                    });
                    // 响应示例
                    $('#responseSample').jsonViewer(d.sample);
                }
            });
            $('.page-wrapper').css({'min-height': $(window).height() - 120});
        });

        // 简介
        $('#apiInfo').on('click', function () {
            renderDescription(apidocs);
            $('#menu').find('li').removeClass('active');
            $(this).addClass('active');
        });

        $('.scroll-sidebar').slimScroll({
            position: 'left',
            size: '5px',
            height: '100%',
            color: '#dcdcdc'
        });
    }

    var sampleCache = {};
    /**
     * retrieves object definition
     */
    function resolveReference(openApiSpec, object) {
        var result = object;
        if (object.$ref) {
            var parts = object.$ref.replace('#/', '').split('/');
            result = openApiSpec;
            for (var i = 0, j = parts.length; i < j; i++) {
                result = result[parts[i]];
            }
        }
        return $.extend({}, result);
    };

    /**
     * handles allOf property of a schema
     */
    function resolveAllOf(openApiSpec, schema) {
        if (schema.allOf) {
            $.each(schema.allOf, function(i, def) {
                $.merge(schema, resolveReference(openApiSpec, def));
            });
            delete schema.allOf;
        }
        return schema;
    }

    /**
     * generates a sample object (request body or response body)
     */
    function getSampleObj(openApiSpec, schema, currentGenerated) {
        var sample, def, name, prop;
        currentGenerated = currentGenerated || {}; // used to handle circular references
        schema = resolveAllOf(openApiSpec, schema);
        if (schema.default || schema.example) {
            sample = schema.default || schema.example;
        } else if (schema.properties) {
            sample = {};
            for (name in schema.properties) {
                prop = schema.properties[name];
                sample[name] = getSampleObj(openApiSpec, prop.schema || prop, currentGenerated);
            }
        } else if (schema.additionalProperties) {
            // this is a map/dictionary
            // @see https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md#model-with-mapdictionary-properties
            def = resolveReference(openApiSpec, schema.additionalProperties);
            sample = {
                'string': getSampleObj(openApiSpec, def, currentGenerated)
            };
        } else if (schema.$ref) {
            // complex object
            def = resolveReference(openApiSpec, schema);
            if (def) {
                if (!sampleCache[schema.$ref] && !currentGenerated[schema.$ref]) {
                    // object not in cache
                    currentGenerated[schema.$ref] = true;
                    sampleCache[schema.$ref] = getSampleObj(openApiSpec, def, currentGenerated);
                }
                sample = sampleCache[schema.$ref] || {};
            } else {
                console.warn('SwaggerUI: schema not found', schema.$ref);
                sample = schema.$ref;
            }
        } else if (schema.type === 'array') {
            sample = [getSampleObj(openApiSpec, schema.items, currentGenerated)];
        } else if (schema.type === 'object') {
            sample = {};
        } else {
            sample = schema.defaultValue || schema.example || getSampleValue(schema);
        }
        return sample;
    }

    /**
     * generates a sample value for a basic type
     */
    function getSampleValue(schema) {
        var result,
            type = getType(schema);

        switch (type) {
            case 'long':
            case 'integer':
                result = 0;
                break;
            case 'boolean':
                result = false;
                break;
            case 'float':
            case 'double':
            case 'number':
                result = 0.0;
                break;
            case 'string':
            case 'byte':
            case 'binary':
            case 'password':
                result = 'string';
                if (schema.enum && schema.enum.length > 0) {
                    result = schema.enum[0];
                }
                break;
            case 'date':
                result = (new Date()).toISOString().split('T')[0];
                break;
            case 'date-time':
                result = (new Date()).toISOString();
                break;
        }
        return result;
    }

    /**
     * determines a property type
     */
    function getType(item) {
        var format = item.format;
        switch (format) {
            case 'int32':
                format = item.type;
                break;
            case 'int64':
                format = 'long';
                break;
        }
        return format || item.type;
    };

    function getTree(properties, definitions) {
        var propertyTree = [];
        parseDefinition('0', properties, definitions, propertyTree);
        return propertyTree;
    }

    function parseDefinition(pid, props, definitions, propertyTree) {
        var regex1 = new RegExp('#/definitions/(.*)$', 'ig');
        for (var prop in props) {
            var id = generUUID();
            var pvalue = $.extend({}, props[prop]);
            if (pvalue.hasOwnProperty('$ref') || (pvalue['schema'] && pvalue['schema']['$ref'])) {
                console.debug('parseDefinition--ref---' + prop)
                var param_ref = pvalue['$ref'] || (pvalue['schema'] && pvalue['schema']['$ref']);
                if (regex1.test((param_ref))) {
                    var ptype = RegExp.$1;
                    var arrObj = $.extend(pvalue, {id: id, pid: pid, field: prop, type: ptype});
                    propertyTree.push(arrObj);
                    for (var j in definitions) {
                        if (ptype == j) {
                            var tpp = definitions[ptype];
                            var pp_props = tpp['properties'];
                            // for (var prop1 in pp_props) {
                            //     if (prop1 != prop) {
                                    parseDefinition(arrObj.id, pp_props, definitions, propertyTree);
                                // }
                            // }
                        }
                    }
                }
            } else {
                console.debug('parseDefinition--single---' + prop)
                //属性名称prop
                // var id = generUUID();
                var type = getType(pvalue);
                var obj = $.extend(pvalue, {id: id, pid: pid, field: prop, type: type});
                propertyTree.push(obj);
                //判断是否是数组
                if (type == 'array') {
                    console.debug('array...')
                    var items = pvalue['items'];
                    console.debug(pvalue);
                    console.debug(items);
                    console.debug(pvalue.items);
                    if (items.hasOwnProperty('$ref') || (items['schema'] && items['schema']['$ref'])) {
                        var item_ref = items['$ref'] || (items['schema'] && items['schema']['$ref']);
                        console.debug(item_ref);
                        if (regex1.test((item_ref))) {
                            var ptype = RegExp.$1;
                            console.debug(ptype);
                            //获取到对象类名
                            for (var j in definitions) {
                                if (ptype == j) {
                                    var tpp = definitions[ptype];
                                    var pp_props = tpp['properties'];
                                    // for (var prop1 in pp_props) {
                                    //     if (prop1 != prop) {
                                            parseDefinition(obj.id, pp_props, definitions, propertyTree);
                                    //     }
                                    // }
                                }
                            }
                        }
                    }

                }
            }
        }
    }


    function randomNumber() {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    }

    /***
     *
     * 生成uuid
     * @returns {string}
     */
    function generUUID() {
        return (randomNumber() + randomNumber() + '-' + randomNumber() + '-' + randomNumber() + '-' + randomNumber() + '-' + randomNumber() + randomNumber() + randomNumber());
    }

})(jQuery);

