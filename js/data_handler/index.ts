'use strict'
import {exporter} from './exporter'
import * as retrievers from './retrievers'
import * as formatter from './formatters'
import * as ingester from './ingesters'
import * as summary from './summary'
import * as mapper from './mappers'
import * as parser from './parsers'
import type {
  Settings,
  Variable,
  Metadata,
  MeasureInfos,
  DataSets,
  Features,
  Variables,
  References,
  Entities,
  Relations,
  MetaTime,
  LogicalObject,
  Promises,
  DataMaps,
  DataResource,
  MeasureInfo,
  DataPackage,
} from '../types'

module.exports = class DataHandler {
  constructor(
    settings: Settings,
    defaults: {[index: string]: string},
    data: DataSets,
    hooks: {[index: string]: Function}
  ) {
    if (hooks) this.hooks = hooks
    if (defaults) this.defaults = defaults
    if (settings) this.settings = settings
    if (settings.metadata) this.metadata = settings.metadata
    if (data) this.sets = data
    this.in_browser = 'undefined' !== typeof Window
    if ('string' === typeof this.metadata.datasets) this.metadata.datasets = [this.metadata.datasets]
    const init = () => {
      if (!this.metadata.datasets) this.metadata.datasets = Object.keys(this.info)
      if (this.metadata.measure_info) {
        const info = this.metadata.measure_info
        this.metadata.datasets.forEach((d: string) => {
          if (info._references) this.info[d]._references = info._references
          const v = this.info[d].schema.fields
          v.forEach(e => (e.name in info ? (e.info = info[e.name] as MeasureInfo) : ''))
        })
      }
      this.map_variables()
      this.metadata.datasets.forEach((k: string) => {
        this.loaded[k] = k in this.sets
        this.inited[k] = false
        this.data_processed[k] = new Promise(resolve => {
          this.data_promise[k] = resolve
        })
        if (k in this.info)
          this.info[k].site_file = (this.metadata.url ? this.metadata.url + '/' : '') + this.info[k].name + '.json'
        if (this.loaded[k]) {
          this.ingest_data(this.sets[k], k)
        } else if (
          !this.in_browser ||
          (this.settings.settings && !this.settings.settings.partial_init) ||
          !this.defaults.dataset ||
          k === this.defaults.dataset
        )
          this.retrieve(k, this.info[k].site_file)
      })
    }
    if (this.metadata.package && !this.metadata.info) {
      if ('undefined' === typeof window) {
        require('https')
          .get(this.metadata.url + this.metadata.package, (r: {on: Function}) => {
            const c: string[] = []
            r.on('data', (d: string) => {
              c.push(d)
            })
            r.on('end', () => {
              this.info = {}
              const dp: DataPackage = JSON.parse(c.join(''))
              if (dp.measure_info) this.metadata.measure_info = dp.measure_info
              dp.resources.forEach((r: DataResource) => (this.info[r.name] = r))
              init()
            })
          })
          .end()
      } else {
        const f = new window.XMLHttpRequest()
        f.onreadystatechange = () => {
          if (4 === f.readyState) {
            if (200 === f.status) {
              this.info = {}
              const dp = JSON.parse(f.responseText)
              if (dp.measure_info) this.metadata.measure_info = dp.measure_info
              dp.resources.forEach((r: DataResource) => (this.info[r.name] = r))
              init()
            } else {
              throw new Error('failed to load datapackage: ' + f.responseText)
            }
          }
        }
        f.open('GET', this.metadata.url + this.metadata.package)
        f.send()
      }
    } else {
      init()
    }
  }
  hooks: {[index: string]: Function} = {}
  defaults: {[index: string]: string} = {dataview: 'default_view', time: 'time'}
  settings: Settings = {}
  metadata: Metadata = {}
  info: {[index: string]: DataResource} = {}
  sets: DataSets = {}
  in_browser = false
  all_data_ready: Function = () => false
  data_ready: Promise<void> = new Promise(resolve => {
    this.all_data_ready = resolve
  })
  features: Features = {}
  variables: Variables = {}
  variable_codes: Variables = {}
  variable_info: MeasureInfos = {}
  references: References = {}
  entities: Entities = {}
  entity_tree: {[index: string]: Relations} = {}
  meta: MetaTime = {
    times: {},
    variables: {},
    ranges: {},
    overall: {
      range: [Infinity, -Infinity],
      value: [],
    },
  }
  loaded: LogicalObject = {}
  inited: LogicalObject = {}
  inited_summary: Promises = {}
  summary_ready: {[index: string]: Function} = {}
  data_maps: DataMaps = {}
  data_queue: {[index: string]: {[index: string]: Function}} = {}
  data_promise: {[index: string]: Function} = {}
  data_processed: Promises = {}
  load_requests: {[index: string]: string} = {}
  retrieve = async function (name: string, url: string) {
    if (!this.load_requests[name]) {
      this.load_requests[name] = url
      const f = new window.XMLHttpRequest()
      f.onreadystatechange = () => {
        if (4 === f.readyState) {
          if (200 === f.status) {
            this.ingest_data(JSON.parse(f.responseText), name)
          } else {
            throw new Error('DataHandler.retrieve failed: ' + f.responseText)
          }
        }
      }
      f.open('GET', url, true)
      f.send()
    }
  }
  format_value = formatter.value
  format_label = formatter.label
  retrievers = retrievers
  ingest_data = ingester.data
  ingest_map = ingester.map
  load_id_maps = ingester.id_maps
  init_summary = summary.init
  calculate_summary = summary.calculate
  map_variables = mapper.variables
  map_entities = mapper.entities
  parse_query = parser.query
  export = exporter
  get_variable = async function (variable: string, view: string): Promise<Variable> {
    if (variable in this.variables) await this.calculate_summary(variable, view, true)
    return this.variables[variable]
  }
}
